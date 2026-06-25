const mysql = require('mysql2/promise');
const config = require('./env');
const logger = require('../utils/logger');

// Pool koneksi MySQL. decimalNumbers:true agar kolom DECIMAL (saldo, kWh)
// dikembalikan sebagai number JS, bukan string — menyederhanakan kalkulasi.
const pool = mysql.createPool({
  host: config.db.host,
  user: config.db.user,
  password: config.db.password,
  database: config.db.name,
  port: config.db.port,
  waitForConnections: true,
  connectionLimit: config.db.connectionLimit,
  queueLimit: 0,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

// Dipanggil saat boot untuk gagal-cepat bila DB tak terjangkau.
async function assertConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    logger.info(`Database terhubung → ${config.db.name}@${config.db.host}:${config.db.port}`);
  } finally {
    conn.release();
  }
}

module.exports = { pool, assertConnection };
