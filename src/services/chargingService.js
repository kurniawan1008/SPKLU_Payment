const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const deviceService = require('./deviceService');

const PRICE_PER_KWH = config.pricePerKwh;
const TICK_KWH = 0.04;          // energi tersalur per detik (HANYA simulasi kanal virtual)
const NOMINAL_VOLTAGE = 400;    // tegangan nominal DC (untuk telemetri tampilan simulasi)
const STOP_FALLBACK_MS = 20000; // bila mesin tak konfirmasi STOP, settle lokal sebagai jaring pengaman

// Memulai sesi pengisian: validasi kanal & saldo, lalu aktifkan konektor (atomik).
// io diperlukan agar — untuk kanal milik mesin nyata — kita bisa kirim $AUTH/$START.
async function startCharging(userId, { channelId, mode, amount }, io) {
  const conn = await pool.getConnection();
  let device = null;
  let sessionInfo = null;
  try {
    await conn.beginTransaction();

    const [chRows] = await conn.query('SELECT * FROM channels WHERE id = ? FOR UPDATE', [channelId]);
    const channel = chRows[0];
    if (!channel) throw ApiError.notFound('Kanal tidak ditemukan.');
    if (channel.status !== 'READY') throw ApiError.conflict('Kanal sedang digunakan.');

    // Kanal terikat mesin fisik? Jika ya, mesin harus online — cegah tagihan palsu.
    if (channel.device_id != null) {
      const [devRows] = await conn.query(
        'SELECT id, online, mode FROM devices WHERE id = ? LIMIT 1',
        [channel.device_id]
      );
      const dev = devRows[0];
      if (!dev || !dev.online) {
        throw ApiError.conflict('Mesin SPKLU sedang offline. Coba lagi saat mesin terhubung.');
      }
      device = { id: dev.id, ch: Number(channel.device_ch), mode: dev.mode };
    }

    const targetKwh = mode === 'KWH' ? amount : amount / PRICE_PER_KWH;
    const maxCost = targetKwh * PRICE_PER_KWH;
    const startMode = mode === 'KWH' ? 'KWH' : 'NOMINAL';

    const [userRows] = await conn.query('SELECT balance FROM users WHERE id = ? FOR UPDATE', [userId]);
    if (Number(userRows[0].balance) < maxCost) {
      throw ApiError.badRequest('Saldo Anda tidak mencukupi untuk target pengisian ini.');
    }

    const sessionId = 'SESS-' + Date.now();
    await conn.query(
      'INSERT INTO sessions (id, user_id, channel_id, start_mode, target_kwh, status) VALUES (?,?,?,?,?,"ACTIVE")',
      [sessionId, userId, channelId, startMode, targetKwh]
    );
    await conn.query(
      'UPDATE channels SET status="CHARGING", current_user_id=?, current_session_id=? WHERE id=?',
      [userId, sessionId, channelId]
    );

    await conn.commit();
    sessionInfo = { sessionId, targetKwh };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }

  // Untuk kanal mesin nyata: otorisasi + mulai di hardware.
  // Batas SELALU dalam kWh (lt=1) agar konsisten dengan tarif server, apa pun
  // mode input (RUPIAH dikonversi ke kWh). Firmware auto-STOP & lapor kWh final.
  if (device) {
    const lval = sessionInfo.targetKwh.toFixed(3);
    deviceService.sendCommand(io, device.id, `$AUTH,${device.ch},${sessionInfo.sessionId},1,${lval}`);
    deviceService.sendCommand(io, device.id, `$START,${device.ch}`);
    logger.info(`Sesi ${sessionInfo.sessionId} → mesin ${device.id} ch${device.ch} ($AUTH+$START, ${lval} kWh).`);
  }

  return { message: 'Sesi pengisian dimulai. Konektor aktif.', ...sessionInfo };
}

// Inti penyelesaian sesi: hitung biaya dari finalKwh, potong saldo, bebaskan
// kanal, catat log, broadcast. Idempoten via status ACTIVE + FOR UPDATE.
async function _finalize(sessionId, finalKwh, status, io) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM sessions WHERE id = ? AND status = "ACTIVE" FOR UPDATE',
      [sessionId]
    );
    const session = rows[0];
    if (!session) {
      await conn.rollback();
      return null; // sudah diselesaikan oleh jalur lain — no-op.
    }

    const kwh = Number(finalKwh);
    const finalCost = kwh * PRICE_PER_KWH;

    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [finalCost, session.user_id]);
    await conn.query(
      'UPDATE sessions SET status=?, end_time=NOW(), total_cost=?, consumed_kwh=? WHERE id=?',
      [status, finalCost, kwh, sessionId]
    );
    await conn.query(
      'UPDATE channels SET status="READY", current_user_id=NULL, current_session_id=NULL WHERE id=?',
      [session.channel_id]
    );
    const chLabel = `CH-${String(session.channel_id).padStart(2, '0')}`;
    await conn.query(
      'INSERT INTO transaction_logs (user_id, amount, type, description) VALUES (?,?,?,?)',
      [session.user_id, finalCost, 'CHARGING_FEE', `${chLabel} · ${kwh.toFixed(1)} kWh`]
    );

    await conn.commit();

    if (io) {
      io.to(`user_${session.user_id}`).emit('charging_finished', {
        sessionId,
        status,
        consumedKwh: kwh,
        totalCost: finalCost,
        message:
          status === 'STOPPED'
            ? `Pengisian dihentikan. Energi tersalur ${kwh.toFixed(4)} kWh.`
            : 'Pengisian selesai — target tercapai.',
      });
      io.to('admin').emit('admin_metrics_update', { event: 'SESSION_SETTLED', channelId: session.channel_id });
    }

    logger.info(`Sesi ${sessionId} diselesaikan (${status}), ${kwh.toFixed(3)} kWh, Rp${finalCost.toLocaleString('id-ID')}.`);
    return { message: 'Sesi diselesaikan.', status, totalCost: finalCost };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Penyelesaian lokal (simulasi / fallback) — pakai consumed_kwh yang tercatat.
async function settleSession(sessionId, isManualStop, io) {
  const [rows] = await pool.query('SELECT consumed_kwh FROM sessions WHERE id = ?', [sessionId]);
  if (!rows.length) throw ApiError.notFound('Sesi tidak ditemukan atau sudah selesai.');
  const status = isManualStop ? 'STOPPED' : 'COMPLETED';
  const res = await _finalize(sessionId, Number(rows[0].consumed_kwh), status, io);
  return res || { message: 'Sesi sudah selesai.', status };
}

// Penyelesaian dari event mesin (#EVT session_complete/session_stop/cable_unplug).
// kWh diambil dari register energi modul (akurat) → sumber tagihan resmi.
async function settleByDevice(channelId, finalKwh, status, io) {
  const [rows] = await pool.query(
    'SELECT id FROM sessions WHERE channel_id = ? AND status = "ACTIVE" ORDER BY start_time DESC LIMIT 1',
    [channelId]
  );
  if (!rows.length) return null; // tak ada sesi aktif — abaikan (mis. mode FREE/HMI manual).
  return _finalize(rows[0].id, finalKwh, status, io);
}

// Permintaan berhenti (user/admin) — sadar-hardware.
// Kanal mesin online → kirim $STOP, settle saat #EVT tiba (kWh asli). Jaring
// pengaman: bila tak ada konfirmasi dalam STOP_FALLBACK_MS, settle lokal.
async function requestStop(sessionId, io) {
  const [rows] = await pool.query(
    'SELECT id, channel_id, status FROM sessions WHERE id = ? LIMIT 1',
    [sessionId]
  );
  if (!rows.length) throw ApiError.notFound('Sesi tidak ditemukan.');
  if (rows[0].status !== 'ACTIVE') return { message: 'Sesi sudah selesai.', status: rows[0].status };

  const channelId = Number(rows[0].channel_id);
  const dev = await deviceService.getDeviceForChannel(channelId);

  if (dev && dev.online) {
    deviceService.sendCommand(io, dev.deviceId, `$STOP,${dev.deviceCh}`);
    deviceService.sendCommand(io, dev.deviceId, `$DEAUTH,${dev.deviceCh}`);
    setTimeout(() => {
      settleSession(sessionId, true, io).catch((err) =>
        logger.error('Fallback settle gagal:', err.message)
      );
    }, STOP_FALLBACK_MS).unref?.();
    return { message: 'Perintah berhenti dikirim ke mesin.', pending: true };
  }

  // Kanal virtual atau mesin offline → settle lokal langsung.
  return settleSession(sessionId, true, io);
}

// Stop oleh pengguna — pastikan kepemilikan sesi sebelum minta berhenti.
async function stopByUser(userId, sessionId, io) {
  const [rows] = await pool.query('SELECT user_id FROM sessions WHERE id = ?', [sessionId]);
  if (!rows.length) throw ApiError.notFound('Sesi tidak ditemukan.');
  if (rows[0].user_id !== userId) throw ApiError.forbidden('Sesi ini bukan milik Anda.');
  return requestStop(sessionId, io);
}

// Mesin simulasi telemetri — HANYA untuk kanal virtual (TIDAK terikat mesin fisik).
// Kanal milik mesin (device_id != NULL) selalu dikendalikan hardware: telemetri &
// settle via #EVT. Bila mesin offline mid-sesi, kanal "pause" (tanpa update) sampai
// gateway tersambung lagi — JANGAN disimulasikan agar tak ada tagihan palsu.
async function runTelemetrySimulation(io) {
  const [sessions] = await pool.query(
    `SELECT s.* FROM sessions s
     JOIN channels c ON c.id = s.channel_id
     WHERE s.status = 'ACTIVE' AND c.device_id IS NULL`
  );

  for (const session of sessions) {
    const target = Number(session.target_kwh);
    const consumed = Number(session.consumed_kwh) + TICK_KWH;

    if (consumed >= target) {
      await pool.query('UPDATE sessions SET consumed_kwh = ? WHERE id = ?', [target, session.id]);
      await settleSession(session.id, false, io).catch((err) =>
        logger.error('Gagal menyelesaikan sesi otomatis:', err.message)
      );
    } else {
      await pool.query('UPDATE sessions SET consumed_kwh = ? WHERE id = ?', [consumed, session.id]);
      const cost = consumed * PRICE_PER_KWH;
      const voltage = NOMINAL_VOLTAGE + (Math.random() - 0.5) * 4;
      const baseCurrent = (TICK_KWH * 1000 * 3600) / NOMINAL_VOLTAGE;
      const current = baseCurrent + (Math.random() - 0.5) * 10;
      const power = (voltage * current) / 1000;
      io.to(`user_${session.user_id}`).emit('telemetry_update', {
        sessionId: session.id,
        channelId: session.channel_id,
        consumedKwh: Number(consumed.toFixed(4)),
        costSoFar: Number(cost.toFixed(2)),
        voltage: Number(voltage.toFixed(1)),
        current: Number(current.toFixed(1)),
        power: Number(power.toFixed(1)),
        progress: target > 0 ? Math.min(100, (consumed / target) * 100) : 0,
      });
    }
  }
}

module.exports = {
  startCharging,
  settleSession,
  settleByDevice,
  requestStop,
  stopByUser,
  runTelemetrySimulation,
  PRICE_PER_KWH,
};
