const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');

async function getProfile(userId) {
  const [users] = await pool.query(
    'SELECT id, email, full_name, username, npk, phone, balance, role, status, created_at FROM users WHERE id = ?',
    [userId]
  );
  if (!users.length) throw ApiError.notFound('Pengguna tidak ditemukan.');

  const [sessions] = await pool.query(
    'SELECT * FROM sessions WHERE user_id = ? AND status = "ACTIVE" LIMIT 1',
    [userId]
  );

  return { user: users[0], activeSession: sessions[0] || null };
}

async function updateProfile(userId, data) {
  const { full_name, username, npk, phone, email } = data;

  const [dupe] = await pool.query(
    'SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?',
    [email, username, userId]
  );
  if (dupe.length) throw ApiError.conflict('Email atau username sudah digunakan pengguna lain.');

  await pool.query(
    'UPDATE users SET full_name=?, username=?, npk=?, phone=?, email=? WHERE id=?',
    [full_name, username, npk, phone, email, userId]
  );
  return { message: 'Profil berhasil diperbarui.' };
}

async function getTransactions(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM transaction_logs WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

// Pengguna mengajukan isi saldo → masuk antrean PENDING, menunggu persetujuan admin.
async function requestTopup(userId, amount) {
  await pool.query(
    'INSERT INTO topup_requests (user_id, amount, status) VALUES (?,?,"PENDING")',
    [userId, amount]
  );
  return { message: 'Permintaan isi saldo terkirim. Menunggu persetujuan admin.' };
}

async function getChannels() {
  // Sertakan info stasiun & mesin agar klien bisa mengelompokkan channel per
  // titik SPKLU (pemilihan channel jadi per-stasiun, tidak datar 12 sekaligus).
  const [rows] = await pool.query(
    `SELECT c.*, st.name AS station_name, st.city AS station_city,
            st.power_kw AS station_power_kw, st.type AS station_type,
            d.online AS device_online
     FROM channels c
     LEFT JOIN stations st ON st.id = c.station_id
     LEFT JOIN devices d ON d.id = c.device_id
     ORDER BY c.station_id, c.device_ch, c.id`
  );
  return rows;
}

module.exports = { getProfile, updateProfile, getTransactions, requestTopup, getChannels };
