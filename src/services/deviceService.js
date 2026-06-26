// ============================================================================
// deviceService — akses data `devices` + jembatan kirim perintah ke gateway.
// Tidak bergantung pada service lain (hindari require-cycle): chargingService
// & deviceGateway boleh meng-import file ini, tidak sebaliknya.
// ============================================================================
const { pool } = require('../config/db');

const DEVICE_NS = '/device'; // namespace Socket.IO khusus gateway mesin

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

// Kirim satu baris protokol ($...) ke gateway mesin lewat Socket.IO.
// Mengembalikan true bila ada minimal satu gateway di room device tsb.
function sendCommand(io, deviceId, line) {
  if (!io) return false;
  io.of(DEVICE_NS).to(`device_${deviceId}`).emit('send', line);
  return true;
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
  sendCommand,
};
