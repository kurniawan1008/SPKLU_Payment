const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Memetakan baris DB (snake_case) ke kontrak Station publik (camelCase) —
// bentuk persis yang diharapkan GET /api/stations & StationsPanel di klien.
//
// Jumlah konektor & ketersediaan SELALU mengikuti channel mesin yang terdaftar
// (lewat agregat ch_total/ch_ready/ch_charging dari listStations) — 0 untuk
// lokasi tanpa mesin. Status diturunkan saat lokasi punya channel; bila belum,
// pakai status metadata (fallback manual untuk lokasi yang belum ada mesinnya).
function toStation(r) {
  const hasAgg = r.ch_total != null; // listStations menyertakan agregat; getStation tidak
  const total = hasAgg ? Number(r.ch_total) : 0;
  const ready = Number(r.ch_ready || 0);
  const charging = Number(r.ch_charging || 0);

  const connectors = hasAgg ? total : Number(r.connectors);
  const available = hasAgg ? ready : Number(r.available);
  const status =
    total > 0 ? (ready > 0 ? 'ONLINE' : charging > 0 ? 'BUSY' : 'OFFLINE') : r.status;

  return {
    id: Number(r.id),
    name: r.name,
    address: r.address,
    city: r.city,
    lat: Number(r.lat),
    lng: Number(r.lng),
    status,
    connectors,
    available,
    charging,
    hasChannels: total > 0,
    powerKw: Number(r.power_kw),
    type: r.type,
    hours: r.hours,
  };
}

// Memetakan input tervalidasi (camelCase) ke nilai kolom DB. connectors/available
// kini bersifat vestigial (tampilan diturunkan dari channel mesin), jadi default 0
// bila form tidak mengirimnya — lokasi baru mulai dari 0 channel sampai ada mesin.
function toColumns(data) {
  const connectors = Math.max(0, Number(data.connectors ?? 0) || 0);
  const available = Math.max(0, Math.min(Number(data.available ?? 0) || 0, connectors));
  return {
    name: data.name,
    address: data.address,
    city: data.city,
    lat: Number(data.lat),
    lng: Number(data.lng),
    status: data.status || 'ONLINE',
    connectors,
    available,
    power_kw: Number(data.powerKw),
    type: data.type || 'DC',
    hours: data.hours || '24 Jam',
  };
}

// Daftar seluruh SPKLU, urut nama (dipakai endpoint publik & admin).
// LEFT JOIN channels → hitung konektor nyata + status terkini per stasiun,
// agar tampilan (peta user, tabel admin, monitor) sinkron dgn kondisi lapangan.
async function listStations() {
  const [rows] = await pool.query(
    `SELECT st.*,
            COUNT(c.id) AS ch_total,
            COALESCE(SUM(c.status = 'READY'), 0)    AS ch_ready,
            COALESCE(SUM(c.status = 'CHARGING'), 0) AS ch_charging,
            COALESCE(SUM(c.status = 'OFFLINE'), 0)  AS ch_offline
     FROM stations st
     LEFT JOIN channels c ON c.station_id = st.id
     GROUP BY st.id
     ORDER BY st.name`
  );
  return rows.map(toStation);
}

// Ambil satu stasiun atau lempar 404.
async function getStation(id) {
  const [rows] = await pool.query('SELECT * FROM stations WHERE id = ?', [id]);
  if (!rows.length) throw ApiError.notFound('Stasiun tidak ditemukan.');
  return toStation(rows[0]);
}

// Tambah stasiun baru (admin).
async function createStation(data) {
  const c = toColumns(data);
  const [result] = await pool.query(
    `INSERT INTO stations (name, address, city, lat, lng, status, connectors, available, power_kw, type, hours)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [c.name, c.address, c.city, c.lat, c.lng, c.status, c.connectors, c.available, c.power_kw, c.type, c.hours]
  );
  return getStation(result.insertId);
}

// Ubah detail stasiun (admin). 404 bila id tak ada.
async function updateStation(id, data) {
  // Cek keberadaan lebih dulu: affectedRows UPDATE bisa 0 saat nilai tak
  // berubah (mis. admin menyimpan tanpa mengubah field) → hindari 404 palsu.
  await getStation(id); // melempar 404 bila stasiun tidak ada
  const c = toColumns(data);
  await pool.query(
    `UPDATE stations
     SET name=?, address=?, city=?, lat=?, lng=?, status=?, connectors=?, available=?, power_kw=?, type=?, hours=?
     WHERE id = ?`,
    [c.name, c.address, c.city, c.lat, c.lng, c.status, c.connectors, c.available, c.power_kw, c.type, c.hours, id]
  );
  return getStation(id);
}

// Hapus stasiun (admin). 404 bila id tak ada.
async function deleteStation(id) {
  const [result] = await pool.query('DELETE FROM stations WHERE id = ?', [id]);
  if (!result.affectedRows) throw ApiError.notFound('Stasiun tidak ditemukan.');
  return { message: 'Stasiun berhasil dihapus.', id: Number(id) };
}

module.exports = { listStations, getStation, createStation, updateStation, deleteStation };
