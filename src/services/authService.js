const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

function sanitize(user) {
  const { password, ...rest } = user;
  return rest;
}

async function register(data) {
  const { email, username, password, full_name, npk, phone } = data;

  const [existing] = await pool.query(
    'SELECT id FROM users WHERE email = ? OR username = ?',
    [email, username]
  );
  if (existing.length) throw ApiError.conflict('Email atau username sudah terdaftar.');

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (email, password, full_name, username, npk, phone) VALUES (?,?,?,?,?,?)',
    [email, hash, full_name, username, npk, phone]
  );

  return { message: 'Registrasi akun berhasil. Silakan masuk.' };
}

async function login(data) {
  const { email, password } = data;

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
  const user = rows[0];
  // Generic error — mencegah user enumeration. Tidak bedakan "akun tidak ada" vs "password salah".
  if (!user || !(await bcrypt.compare(password, user?.password || ''))) {
    throw ApiError.unauthorized('Email atau kata sandi tidak valid.');
  }
  if (user.status === 'SUSPENDED') throw ApiError.forbidden('Akun Anda ditangguhkan. Hubungi admin.');

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, full_name: user.full_name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  return { token, role: user.role, user: sanitize(user) };
}

module.exports = { register, login };
