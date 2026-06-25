// Konfigurasi terpusat — semua akses environment hanya lewat file ini.
require('dotenv').config();

function required(key, fallback) {
  const val = process.env[key] ?? fallback;
  if (val === undefined || val === '') {
    throw new Error(`[CONFIG] Variabel environment "${key}" wajib diisi di file .env`);
  }
  return val;
}

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isProd: env === 'production',
  port: parseInt(process.env.PORT || '3000', 10),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  db: {
    host: required('DB_HOST', 'localhost'),
    user: required('DB_USER', 'root'),
    password: process.env.DB_PASSWORD ?? '',
    name: required('DB_NAME', 'spklu_db'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    connectionLimit: parseInt(process.env.DB_POOL || '10', 10),
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  pricePerKwh: parseFloat(process.env.PRICE_PER_KWH || '2440'),
};

module.exports = config;
