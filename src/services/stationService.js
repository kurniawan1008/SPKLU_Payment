const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Memetakan baris DB (snake_case) ke kontrak Station publik (camelCase) —
// bentuk persis yang diharapkan GET /api/stations & StationsPanel di klien.
function toStation(r) {
  return {
    id: Number(r.id),
    name: r.name,
    address: r.address,
    city: r.city,
    lat: Number(r.lat),
    lng: Number(r.lng),
    status: r.status,
    connectors: Number(r.connectors),
    available: Number(r.available),
    powerKw: Number(r.power_kw),
    type: r.type,
    hours: r.hours,
  };
}

// Memetakan input tervalidasi (camelCase) ke nilai kolom DB, sekaligus
// menjaga invariant available <= connectors dan available >= 0.
function toColumns(data) {
  const connectors = Number(data.connectors);
  const available = Math.max(0, Math.min(Number(data.available ?? 0), connectors));
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
async function listStations() {
  const [rows] = await pool.query('SELECT * FROM stations ORDER BY name');
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
