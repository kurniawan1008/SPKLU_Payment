// ============================================================================
// deviceService — akses data `devices` + jembatan kirim perintah ke gateway.
// Tidak bergantung pada service lain (hindari require-cycle): chargingService
// & deviceGateway boleh meng-import file ini, tidak sebaliknya.
// ============================================================================
const crypto = require('crypto');
const { pool } = require('../config/db');

const DEVICE_NS = '/device'; // namespace Socket.IO khusus gateway mesin

// Token rahasia acak untuk autentikasi gateway (48 hex = 24 byte).
function genDeviceKey() {
  return crypto.randomBytes(24).toString('hex');
}

// Semua mesin (untuk dashboard admin).
async function listDevices() {
  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.station_id, d.mode, d.online, d.last_seen_at, d.fw_info,
            st.name AS station_name, st.city AS station_city,
            COUNT(c.id) AS channels
     FROM devices d
     LEFT JOIN stations st ON st.id = d.station_id
     LEFT JOIN channels c ON c.device_id = d.id
     GROUP BY d.id, d.name, d.station_id, d.mode, d.online, d.last_seen_at, d.fw_info,
              st.name, st.city
     ORDER BY d.id`
  );
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    stationId: r.station_id == null ? null : Number(r.station_id),
    stationName: r.station_name || null,
    stationCity: r.station_city || null,
    mode: r.mode,
    online: !!r.online,
    lastSeenAt: r.last_seen_at,
    fwInfo: r.fw_info,
    channels: Number(r.channels),
  }));
}

async function getByKey(deviceKey) {
  const [rows] = await pool.query(
    'SELECT id, name, station_id, mode FROM devices WHERE device_key = ? LIMIT 1',
    [deviceKey]
  );
  return rows[0] || null;
}

async function getById(id) {
  const [rows] = await pool.query('SELECT * FROM devices WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// Peta konektor mesin → kanal DB: { [device_ch]: channelId }.
async function getChannelMap(deviceId) {
  const [rows] = await pool.query(
    'SELECT id, device_ch FROM channels WHERE device_id = ? AND device_ch IS NOT NULL',
    [deviceId]
  );
  const map = {};
  for (const r of rows) map[Number(r.device_ch)] = Number(r.id);
  return map;
}

// Info mesin untuk sebuah kanal (untuk memutuskan: hardware nyata atau simulasi).
async function getDeviceForChannel(channelId) {
  const [rows] = await pool.query(
    `SELECT d.id AS device_id, c.device_ch, d.online, d.mode
     FROM channels c JOIN devices d ON d.id = c.device_id
     WHERE c.id = ? LIMIT 1`,
    [channelId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    deviceId: Number(r.device_id),
    deviceCh: Number(r.device_ch),
    online: !!r.online,
    mode: r.mode,
  };
}

async function setOnline(id, online, fwInfo) {
  await pool.query(
    'UPDATE devices SET online = ?, last_seen_at = NOW(), fw_info = COALESCE(?, fw_info) WHERE id = ?',
    [online ? 1 : 0, fwInfo || null, id]
  );
}

async function touch(id) {
  await pool.query('UPDATE devices SET last_seen_at = NOW() WHERE id = ?', [id]);
}

async function setMode(id, mode) {
  await pool.query('UPDATE devices SET mode = ? WHERE id = ?', [mode, id]);
}

// Saat proses backend mulai/berhenti: pastikan tidak ada device "nyangkut" online.
async function markAllOffline() {
  await pool.query('UPDATE devices SET online = 0');
}

// Saat mesin terputus: kanal tanpa sesi aktif → OFFLINE (konektor tak terjangkau).
// Kanal dengan sesi website aktif dibiarkan (ditangani fallback-settle).
async function markChannelsOffline(deviceId) {
  await pool.query(
    `UPDATE channels SET status = 'OFFLINE'
     WHERE device_id = ? AND current_session_id IS NULL AND status <> 'OFFLINE'`,
    [deviceId]
  );
}

// Kirim satu baris protokol ($...) ke gateway mesin lewat Socket.IO.
// Mengembalikan true bila ada minimal satu gateway di room device tsb.
function sendCommand(io, deviceId, line) {
  if (!io) return false;
  io.of(DEVICE_NS).to(`device_${deviceId}`).emit('send', line);
  return true;
}

// ===== Pendaftaran & pengelolaan mesin (admin) =====

// Daftarkan mesin baru + buat N kanal (konektor fisik) terpetakan device_ch 1..N.
// Mengembalikan device_key sekali ini (disalin admin ke gateway). Atomik.
async function createDevice({ name, stationId, connectors }) {
  const n = Math.max(1, Math.min(3, Number(connectors) || 1));
  const sid = stationId ? Number(stationId) : null;
  const deviceKey = genDeviceKey();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO devices (device_key, name, station_id, mode) VALUES (?,?,?,?)',
      [deviceKey, name, sid, 'OFFLINE']
    );
    const deviceId = r.insertId;
    for (let ch = 1; ch <= n; ch++) {
      await conn.query(
        'INSERT INTO channels (station_id, device_id, device_ch, status) VALUES (?,?,?,?)',
        [sid, deviceId, ch, 'READY']
      );
    }
    await conn.commit();
    return { id: deviceId, name, stationId: sid, connectors: n, deviceKey };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Ubah nama & stasiun mesin; kanal mesin ikut pindah stasiun. Atomik.
async function updateDevice(id, { name, stationId }) {
  const sid = stationId ? Number(stationId) : null;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE devices SET name = ?, station_id = ? WHERE id = ?', [name, sid, id]);
    await conn.query('UPDATE channels SET station_id = ? WHERE device_id = ?', [sid, id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Hapus mesin. Kanal tanpa riwayat sesi dihapus; yang punya riwayat di-lepas
// petakan (device_id/device_ch = NULL) agar audit transaksi tetap utuh. Atomik.
async function deleteDevice(id) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `DELETE c FROM channels c
       WHERE c.device_id = ?
         AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.channel_id = c.id)`,
      [id]
    );
    await conn.query(
      'UPDATE channels SET device_id = NULL, device_ch = NULL WHERE device_id = ?',
      [id]
    );
    await conn.query('DELETE FROM devices WHERE id = ?', [id]);
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Buat ulang device_key (mis. bila bocor). Gateway lama otomatis tertolak.
async function regenerateKey(id) {
  const deviceKey = genDeviceKey();
  await pool.query('UPDATE devices SET device_key = ? WHERE id = ?', [deviceKey, id]);
  return deviceKey;
}

// Ambil device_key untuk ditampilkan/disalin admin (on-demand, bukan di list).
async function getKey(id) {
  const [rows] = await pool.query('SELECT device_key FROM devices WHERE id = ? LIMIT 1', [id]);
  return rows.length ? rows[0].device_key : null;
}

// Jumlah sesi AKTIF pada kanal milik mesin (untuk cegah hapus saat dipakai).
async function countActiveSessions(deviceId) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS n FROM sessions s
     JOIN channels c ON c.id = s.channel_id
     WHERE c.device_id = ? AND s.status = 'ACTIVE'`,
    [deviceId]
  );
  return Number(row.n);
}

module.exports = {
  DEVICE_NS,
  listDevices,
  getByKey,
  getById,
  getChannelMap,
  getDeviceForChannel,
  setOnline,
  touch,
  setMode,
  markAllOffline,
  markChannelsOffline,
  sendCommand,
  createDevice,
  updateDevice,
  deleteDevice,
  regenerateKey,
  getKey,
  countActiveSessions,
};
