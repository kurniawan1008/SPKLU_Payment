const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const PRICE_PER_KWH = config.pricePerKwh;
const TICK_KWH = 0.04;          // energi tersalur per detik (simulasi hardware)
const NOMINAL_VOLTAGE = 400;    // tegangan nominal DC fast charging (untuk telemetri tampilan)

// Memulai sesi pengisian: validasi kanal & saldo, lalu aktifkan konektor (atomik).
async function startCharging(userId, { channelId, mode, amount }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [chRows] = await conn.query('SELECT * FROM channels WHERE id = ? FOR UPDATE', [channelId]);
    const channel = chRows[0];
    if (!channel) throw ApiError.notFound('Kanal tidak ditemukan.');
    if (channel.status !== 'READY') throw ApiError.conflict('Kanal sedang digunakan.');

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
    return { message: 'Sesi pengisian dimulai. Konektor aktif.', sessionId, targetKwh };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Menyelesaikan sesi (otomatis saat target tercapai, atau manual/admin).
async function settleSession(sessionId, isManualStop, io) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM sessions WHERE id = ? AND status = "ACTIVE" FOR UPDATE',
      [sessionId]
    );
    const session = rows[0];
    if (!session) throw ApiError.notFound('Sesi tidak ditemukan atau sudah selesai.');

    const finalCost = Number(session.consumed_kwh) * PRICE_PER_KWH;
    const status = isManualStop ? 'STOPPED' : 'COMPLETED';

    await conn.query('UPDATE users SET balance = balance - ? WHERE id = ?', [finalCost, session.user_id]);
    await conn.query('UPDATE sessions SET status=?, end_time=NOW(), total_cost=? WHERE id=?', [status, finalCost, sessionId]);
    await conn.query('UPDATE channels SET status="READY", current_user_id=NULL, current_session_id=NULL WHERE id=?', [session.channel_id]);
    const chLabel = `CH-${String(session.channel_id).padStart(2, '0')}`;
    await conn.query(
      'INSERT INTO transaction_logs (user_id, amount, type, description) VALUES (?,?,?,?)',
      [session.user_id, finalCost, 'CHARGING_FEE', `${chLabel} · ${Number(session.consumed_kwh).toFixed(1)} kWh`]
    );

    await conn.commit();

    if (io) {
      io.to(`user_${session.user_id}`).emit('charging_finished', {
        sessionId,
        status,
        consumedKwh: Number(session.consumed_kwh),
        totalCost: finalCost,
        message: isManualStop
          ? `Pengisian dihentikan. Energi tersalur ${Number(session.consumed_kwh).toFixed(4)} kWh.`
          : 'Pengisian selesai — target tercapai.',
      });
      io.to('admin').emit('admin_metrics_update', { event: 'SESSION_SETTLED', channelId: session.channel_id });
    }

    logger.info(`Sesi ${sessionId} diselesaikan (${status}), biaya Rp${finalCost.toLocaleString('id-ID')}.`);
    return { message: 'Sesi diselesaikan.', status, totalCost: finalCost };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Stop oleh pengguna — pastikan kepemilikan sesi sebelum settle.
async function stopByUser(userId, sessionId, io) {
  const [rows] = await pool.query('SELECT user_id FROM sessions WHERE id = ?', [sessionId]);
  if (!rows.length) throw ApiError.notFound('Sesi tidak ditemukan.');
  if (rows[0].user_id !== userId) throw ApiError.forbidden('Sesi ini bukan milik Anda.');
  return settleSession(sessionId, true, io);
}

// Mesin simulasi telemetri — dipanggil tiap detik dari socket engine.
async function runTelemetrySimulation(io) {
  const [sessions] = await pool.query('SELECT * FROM sessions WHERE status = "ACTIVE"');

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
      // Telemetri tampilan: sedikit jitter agar terlihat hidup (voltase/arus/daya).
      const voltage = NOMINAL_VOLTAGE + (Math.random() - 0.5) * 4;       // ~398–402 V
      const baseCurrent = (TICK_KWH * 1000 * 3600) / NOMINAL_VOLTAGE;    // ~360 A
      const current = baseCurrent + (Math.random() - 0.5) * 10;         // jitter ±5 A
      const power = (voltage * current) / 1000;                          // kW
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

module.exports = { startCharging, settleSession, stopByUser, runTelemetrySimulation, PRICE_PER_KWH };
