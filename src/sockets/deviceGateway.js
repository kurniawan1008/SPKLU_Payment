// ============================================================================
// deviceGateway — namespace Socket.IO "/device" untuk gateway mesin SPKLU.
// Gateway (skrip Node di PC lokasi, tersambung USB ke ESP32) meneruskan baris
// protokol mentah: "#..." naik (event 'line'), "$..." turun (event 'send').
// SELURUH logika ada di sini → gateway tetap pipa bodoh yang tahan banting.
//
// Protokol firmware (lihat SPKLU_esp32/INTEGRATION.md):
//   #STATE {"t":ms,"ch":[ {ch,en,st,on,pr,m,v,i,p,vset,iset,kwh,rp,sec,tin,auth,sid,lt}, .. ]}
//   #EVT   {"ev":"session_start|session_stop|session_complete|cable_unplug|fault|...","ch":n,"kwh":..}
//   #OK/#ERR/#PONG/#MODE/#BOOT/#INFO ...
// ============================================================================
const { pool } = require('../config/db');
const config = require('../config/env');
const logger = require('../utils/logger');
const deviceService = require('../services/deviceService');
const chargingService = require('../services/chargingService');

const PRICE_PER_KWH = config.pricePerKwh;

// Ambil bagian JSON setelah token pertama ("#STATE {...}" → "{...}").
function parseJsonAfterTag(line) {
  const sp = line.indexOf(' ');
  if (sp < 0) return null;
  try {
    return JSON.parse(line.slice(sp + 1));
  } catch {
    return null;
  }
}

function initDeviceGateway(io) {
  const ns = io.of(deviceService.DEVICE_NS);

  // Autentikasi gateway via device_key pada handshake.
  ns.use(async (socket, next) => {
    try {
      const key = socket.handshake.auth && socket.handshake.auth.deviceKey;
      if (!key) return next(new Error('device_key wajib diisi'));
      const dev = await deviceService.getByKey(String(key));
      if (!dev) return next(new Error('device_key tidak dikenal'));
      socket.data.device = dev;                 // { id, name, station_id, mode }
      socket.data.chMap = await deviceService.getChannelMap(dev.id); // {device_ch: channelId}
      next();
    } catch (e) {
      next(new Error('auth gagal'));
    }
  });

  ns.on('connection', (socket) => {
    const dev = socket.data.device;
    socket.join(`device_${dev.id}`);

    // PENTING: daftarkan listener SEBELUM operasi async apa pun. Bila tidak,
    // baris yang dikirim gateway tepat setelah connect (mis. balasan #MODE/#STATE
    // atas $GETMODE/$STATUS di bawah) bisa tiba sebelum listener terpasang dan
    // HILANG begitu saja (Socket.IO tidak membuffer event masuk tanpa listener).
    socket.on('line', (raw) => {
      const line = String(raw || '').trim();
      if (!line) return;
      handleLine(io, socket, line).catch((err) =>
        logger.error(`Gateway #${dev.id} line error:`, err.message)
      );
    });

    socket.on('disconnect', () => {
      deviceService.setOnline(dev.id, false).catch(() => {});
      // Konektor tanpa sesi aktif → OFFLINE (mesin tak terjangkau).
      deviceService.markChannelsOffline(dev.id).catch(() => {});
      logger.warn(`Gateway mesin terputus: #${dev.id} ${dev.name}`);
      io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_OFFLINE', deviceId: dev.id });
    });

    logger.info(`Gateway mesin terhubung: #${dev.id} ${dev.name} (${socket.id})`);
    io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_ONLINE', deviceId: dev.id });

    // Tandai online + minta sinkron mode & telemetri awal (fire-and-forget, tak
    // memblok pendaftaran listener di atas).
    deviceService.setOnline(dev.id, true).catch(() => {});
    socket.emit('send', '$GETMODE');
    socket.emit('send', '$STATUS');
  });

  return ns;
}

async function handleLine(io, socket, line) {
  const dev = socket.data.device;
  const chMap = socket.data.chMap || {};

  // ---- Telemetri periodik ----
  if (line.startsWith('#STATE')) {
    const data = parseJsonAfterTag(line);
    if (!data || !Array.isArray(data.ch)) return;
    await deviceService.touch(dev.id).catch(() => {});

    const channelIds = Object.values(chMap);
    if (!channelIds.length) return;

    // Sesi aktif untuk kanal-kanal mesin ini (untuk progress & potong saldo akhir).
    const [actives] = await pool.query(
      `SELECT id, channel_id, user_id, target_kwh FROM sessions
       WHERE status='ACTIVE' AND channel_id IN (${channelIds.map(() => '?').join(',')})`,
      channelIds
    );
    const byChannel = new Map(actives.map((s) => [Number(s.channel_id), s]));

    let statusChanged = false;
    for (const c of data.ch) {
      const channelId = chMap[Number(c.ch)];
      if (!channelId) continue;
      const sess = byChannel.get(channelId);

      if (sess) {
        // Sesi website aktif → simpan progres energi + telemetri ke pengguna.
        // Status kanal tetap CHARGING (diset saat $START), tidak diturunkan di sini.
        const kwh = Number(c.kwh) || 0;
        const target = Number(sess.target_kwh) || 0;
        await pool.query('UPDATE sessions SET consumed_kwh = ? WHERE id = ? AND status="ACTIVE"', [kwh, sess.id]);

        io.to(`user_${sess.user_id}`).emit('telemetry_update', {
          sessionId: sess.id,
          channelId,
          consumedKwh: Number(kwh.toFixed(4)),
          costSoFar: Number((kwh * PRICE_PER_KWH).toFixed(2)),
          voltage: Number((Number(c.v) || 0).toFixed(1)),
          current: Number((Number(c.i) || 0).toFixed(1)),
          power: Number((Number(c.p) || 0).toFixed(1)),
          progress: target > 0 ? Math.min(100, (kwh / target) * 100) : 0,
        });
        continue;
      }

      // Tanpa sesi website → cerminkan kondisi NYATA konektor di lapangan
      // (mis. mode FREE / start manual di HMI). st: 2=CHARGING(terpakai),
      // 4=FAULT→OFFLINE, lainnya READY. Guard current_session_id IS NULL agar
      // tak menimpa kanal yang sedang dipakai sesi website.
      const st = Number(c.st);
      const newStatus = st === 2 ? 'CHARGING' : st === 4 ? 'OFFLINE' : 'READY';
      const [r] = await pool.query(
        'UPDATE channels SET status = ? WHERE id = ? AND status <> ? AND current_session_id IS NULL',
        [newStatus, channelId, newStatus]
      );
      if (r.affectedRows > 0) statusChanged = true;
    }

    // Snapshot mentah untuk monitor mesin di admin (suhu, proteksi, state, dll).
    io.to('admin').emit('device_state', { deviceId: dev.id, t: data.t, ch: data.ch });
    // Bila status terpakai/idle kanal berubah → picu refresh Monitor kanal admin.
    if (statusChanged) io.to('admin').emit('admin_metrics_update', { event: 'CHANNEL_STATE', deviceId: dev.id });
    return;
  }

  // ---- Event siklus hidup sesi ----
  if (line.startsWith('#EVT')) {
    const ev = parseJsonAfterTag(line);
    if (!ev || !ev.ev) return;
    const channelId = chMap[Number(ev.ch)];
    io.to('admin').emit('device_event', { deviceId: dev.id, ...ev });

    if (!channelId) return;
    const kwh = Number(ev.kwh) || 0;

    switch (ev.ev) {
      case 'session_complete':
        await chargingService.settleByDevice(channelId, kwh, 'COMPLETED', io);
        break;
      case 'session_stop':
      case 'cable_unplug':
        await chargingService.settleByDevice(channelId, kwh, 'STOPPED', io);
        break;
      case 'fault':
      case 'ocp_fault': {
        // Beritahu pengguna sesi berjalan (bila ada) + admin. Tidak auto-settle:
        // sesi bisa lanjut/clear; bila benar berhenti, #EVT session_stop menyusul.
        const [rows] = await pool.query(
          'SELECT user_id FROM sessions WHERE channel_id = ? AND status="ACTIVE" LIMIT 1',
          [channelId]
        );
        if (rows.length) {
          io.to(`user_${rows[0].user_id}`).emit('charging_fault', {
            channelId,
            reason: ev.reason || ev.ev,
            message: 'Terjadi gangguan pada konektor. Petugas akan menindaklanjuti.',
          });
        }
        break;
      }
      case 'session_start':
      case 'cleared':
      case 'comm_recovered':
      default:
        break; // cukup diteruskan ke admin di atas.
    }
    return;
  }

  // ---- Balasan / info ----
  if (line.startsWith('#MODE') || line.startsWith('#INFO') || line.startsWith('#OK mode=')) {
    const m = line.match(/mode[=\s]+(ONLINE|OFFLINE)/i) || line.match(/\b(ONLINE|OFFLINE)\b/i);
    if (m) await deviceService.setMode(dev.id, m[1].toUpperCase()).catch(() => {});
  }
  if (line.startsWith('#BOOT')) {
    await deviceService.setOnline(dev.id, true, line.replace('#BOOT', '').trim().slice(0, 110)).catch(() => {});
  }
  // Teruskan semua balasan mentah ke admin (untuk konsol mesin).
  io.to('admin').emit('device_reply', { deviceId: dev.id, line });
}

module.exports = { initDeviceGateway };
