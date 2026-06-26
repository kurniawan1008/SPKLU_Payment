const { pool } = require('../config/db');
const ApiError = require('../utils/ApiError');
const stationService = require('./stationService');
const deviceService = require('./deviceService');

async function listUsers() {
  const [users] = await pool.query(
    `SELECT id, full_name, username, email, npk, phone, balance, role, status, created_at
     FROM users WHERE role = "USER" ORDER BY created_at DESC`
  );
  return users;
}

async function toggleStatus(userId) {
  const [rows] = await pool.query('SELECT status FROM users WHERE id = ?', [userId]);
  if (!rows.length) throw ApiError.notFound('Pengguna tidak ditemukan.');

  const newStatus = rows[0].status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [newStatus, userId]);
  return { message: `Akun berhasil di-${newStatus.toLowerCase()}.`, newStatus };
}

async function getUserLogs(userId) {
  const [logs] = await pool.query(
    'SELECT * FROM transaction_logs WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return logs;
}

async function getAllLogs(limit = 100) {
  const [rows] = await pool.query(
    `SELECT t.id, t.created_at AS waktu, u.username, u.email,
            t.type AS kategori, t.amount AS nilai, t.description AS deskripsi
     FROM transaction_logs t JOIN users u ON t.user_id = u.id
     ORDER BY t.created_at DESC LIMIT ?`,
    [limit]
  );
  return rows;
}

async function topupByConsole({ username, amount }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [users] = await conn.query(
      'SELECT id FROM users WHERE username = ? OR email = ? FOR UPDATE',
      [username, username]
    );
    if (!users.length) throw ApiError.notFound('Username/email tidak ditemukan.');

    const target = users[0];
    await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, target.id]);
    await conn.query(
      'INSERT INTO transaction_logs (user_id, amount, type, description) VALUES (?,?,?,?)',
      [target.id, amount, 'TOPUP', 'Top up via dashboard admin']
    );
    await conn.commit();
    return { message: 'Saldo berhasil ditambahkan.' };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Daftar permintaan isi saldo yang masih menunggu.
async function listTopupRequests() {
  const [rows] = await pool.query(
    `SELECT r.id, r.amount, r.created_at, u.id AS user_id, u.username, u.full_name, u.email
     FROM topup_requests r JOIN users u ON r.user_id = u.id
     WHERE r.status = 'PENDING' ORDER BY r.created_at ASC`
  );
  return rows;
}

// Setujui / tolak permintaan isi saldo (atomik). approve=true → saldo bertambah + log TOPUP.
async function decideTopupRequest(requestId, approve) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      'SELECT * FROM topup_requests WHERE id = ? AND status = "PENDING" FOR UPDATE',
      [requestId]
    );
    const reqRow = rows[0];
    if (!reqRow) throw ApiError.notFound('Permintaan tidak ditemukan atau sudah diproses.');

    if (approve) {
      await conn.query('UPDATE users SET balance = balance + ? WHERE id = ?', [reqRow.amount, reqRow.user_id]);
      await conn.query(
        'INSERT INTO transaction_logs (user_id, amount, type, description) VALUES (?,?,?,?)',
        [reqRow.user_id, reqRow.amount, 'TOPUP', 'Top up saldo']
      );
    }
    await conn.query(
      'UPDATE topup_requests SET status = ?, decided_at = NOW() WHERE id = ?',
      [approve ? 'APPROVED' : 'REJECTED', requestId]
    );
    await conn.commit();
    return {
      message: approve ? 'Permintaan disetujui — saldo ditambahkan.' : 'Permintaan ditolak.',
      userId: reqRow.user_id,
      approved: approve,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// Faktor display: emisi CO2 yang dihemat per kWh (estimasi tampilan saja).
const CO2_FACTOR_KG_PER_KWH = 0.5;

// Membentuk daftar tanggal 'YYYY-MM-DD' untuk :days hari terakhir (inklusif hari ini),
// urut menaik. Dipakai untuk mengisi 0 pada hari tanpa data agar grafik kontinu.
function buildDateWindow(days) {
  const list = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // Format lokal YYYY-MM-DD (hindari pergeseran zona waktu dari toISOString).
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    list.push(`${yyyy}-${mm}-${dd}`);
  }
  return list;
}

// Menormalkan kunci tanggal dari hasil SQL (DATE bisa berupa Date object atau string)
// menjadi 'YYYY-MM-DD' agar cocok dengan window tanggal di JS.
function dayKey(value) {
  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  // String seperti '2026-06-24' atau '2026-06-24T...' → ambil 10 karakter pertama.
  return String(value).slice(0, 10);
}

// Analitik dashboard admin untuk rentang :days hari terakhir.
// Mengembalikan bentuk persis sesuai kontrak GET /api/admin/analytics.
async function getAnalytics(days = 14) {
  const range = Number(days) > 0 ? Number(days) : 14;
  const dateWindow = buildDateWindow(range);

  // --- Energi & jumlah sesi per hari (sesi selesai/dihentikan, group by tanggal selesai) ---
  const [energyRows] = await pool.query(
    `SELECT DATE(end_time) AS day,
            COALESCE(SUM(consumed_kwh),0) AS kwh,
            COUNT(*) AS sessions
     FROM sessions
     WHERE status IN ('COMPLETED','STOPPED')
       AND end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(end_time)`,
    [range - 1]
  );
  const energyMap = new Map(
    energyRows.map((r) => [dayKey(r.day), { kwh: Number(r.kwh), sessions: Number(r.sessions) }])
  );
  const energyByDay = dateWindow.map((day) => ({
    day,
    kwh: energyMap.get(day) ? energyMap.get(day).kwh : 0,
    sessions: energyMap.get(day) ? energyMap.get(day).sessions : 0,
  }));

  // --- Pendapatan per hari (biaya pengisian) ---
  const [revRows] = await pool.query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(amount),0) AS total
     FROM transaction_logs
     WHERE type = 'CHARGING_FEE'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)`,
    [range - 1]
  );
  const revMap = new Map(revRows.map((r) => [dayKey(r.day), Number(r.total)]));
  const revenueByDay = dateWindow.map((day) => ({ day, total: revMap.get(day) || 0 }));

  // --- Top up per hari ---
  const [topupRows] = await pool.query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(amount),0) AS total
     FROM transaction_logs
     WHERE type = 'TOPUP'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY DATE(created_at)`,
    [range - 1]
  );
  const topupMap = new Map(topupRows.map((r) => [dayKey(r.day), Number(r.total)]));
  const topupByDay = dateWindow.map((day) => ({ day, total: topupMap.get(day) || 0 }));

  // --- Distribusi per jam (0-23), isi 0 untuk jam tanpa data ---
  const [hourRows] = await pool.query(
    `SELECT HOUR(start_time) AS hour,
            COALESCE(SUM(consumed_kwh),0) AS kwh,
            COUNT(*) AS sessions
     FROM sessions
     WHERE status IN ('COMPLETED','STOPPED')
       AND end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY HOUR(start_time)`,
    [range - 1]
  );
  const hourMap = new Map(
    hourRows.map((r) => [Number(r.hour), { kwh: Number(r.kwh), sessions: Number(r.sessions) }])
  );
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    kwh: hourMap.get(hour) ? hourMap.get(hour).kwh : 0,
    sessions: hourMap.get(hour) ? hourMap.get(hour).sessions : 0,
  }));

  // --- Pengguna teratas (berdasarkan energi) ---
  const [topUserRows] = await pool.query(
    `SELECT u.username, u.full_name,
            COALESCE(SUM(s.consumed_kwh),0) AS kwh,
            COALESCE(SUM(s.total_cost),0) AS spent,
            COUNT(*) AS sessions
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.status IN ('COMPLETED','STOPPED')
       AND s.end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY s.user_id, u.username, u.full_name
     ORDER BY kwh DESC
     LIMIT 5`,
    [range - 1]
  );
  const topUsers = topUserRows.map((r) => ({
    username: r.username,
    full_name: r.full_name,
    kwh: Number(r.kwh),
    spent: Number(r.spent),
    sessions: Number(r.sessions),
  }));

  // --- Utilisasi per kanal/konektor ---
  const [channelRows] = await pool.query(
    `SELECT channel_id,
            COUNT(*) AS sessions,
            COALESCE(SUM(consumed_kwh),0) AS kwh
     FROM sessions
     WHERE status IN ('COMPLETED','STOPPED')
       AND end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY channel_id
     ORDER BY channel_id`,
    [range - 1]
  );
  const channelUtil = channelRows.map((r) => ({
    channelId: Number(r.channel_id),
    label: `CH-${String(r.channel_id).padStart(2, '0')}`,
    sessions: Number(r.sessions),
    kwh: Number(r.kwh),
  }));

  // --- Performa per titik SPKLU ---
  // Gabungan: agregat sesi NYATA (via channels.station_id) + metadata stasiun
  // (status, konektor, daya, tipe) agar SEMUA stasiun tampil walau belum ada sesi.
  // COUNT(DISTINCT CASE..) agar hitung status channel tidak terinflasi oleh
  // LEFT JOIN sessions (satu channel bisa punya banyak baris sesi).
  const [stationPerfRows] = await pool.query(
    `SELECT st.id AS station_id, st.name, st.city, st.status,
            st.connectors, st.available, st.power_kw, st.type,
            COUNT(DISTINCT c.id) AS channels,
            COUNT(DISTINCT CASE WHEN c.status='READY' THEN c.id END)    AS ch_ready,
            COUNT(DISTINCT CASE WHEN c.status='CHARGING' THEN c.id END) AS ch_charging,
            COUNT(s.id) AS sessions,
            COALESCE(SUM(s.consumed_kwh),0) AS kwh,
            COALESCE(SUM(s.total_cost),0) AS revenue
     FROM stations st
     LEFT JOIN channels c ON c.station_id = st.id
     LEFT JOIN sessions s ON s.channel_id = c.id
          AND s.status IN ('COMPLETED','STOPPED')
          AND s.end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY st.id, st.name, st.city, st.status,
              st.connectors, st.available, st.power_kw, st.type
     ORDER BY kwh DESC, sessions DESC, st.name`,
    [range - 1]
  );
  const stationPerf = stationPerfRows.map((r) => {
    const powerKw = Number(r.power_kw);
    const realTotal = Number(r.channels);
    const hasCh = realTotal > 0;
    // Channel NYATA bila ada; jatuh ke metadata bila stasiun belum punya channel.
    const connectors = hasCh ? realTotal : Number(r.connectors);
    const available = hasCh
      ? Number(r.ch_ready)
      : Math.max(0, Math.min(Number(r.available), connectors));
    const busy = hasCh ? Number(r.ch_charging) : Math.max(0, connectors - available);
    const status = hasCh
      ? (Number(r.ch_ready) > 0 ? 'ONLINE' : Number(r.ch_charging) > 0 ? 'BUSY' : 'OFFLINE')
      : r.status;
    return {
      stationId: Number(r.station_id),
      name: r.name,
      city: r.city,
      status,
      connectors,
      available,
      busy,
      powerKw,
      type: r.type,
      capacityKw: powerKw * connectors,
      utilizationPct: connectors > 0 ? Math.round((busy / connectors) * 100) : 0,
      channels: realTotal,
      sessions: Number(r.sessions),
      kwh: Number(r.kwh),
      revenue: Number(r.revenue),
    };
  });

  // --- Totalan ringkas untuk seluruh rentang ---
  const [[energyTotal]] = await pool.query(
    `SELECT COALESCE(SUM(consumed_kwh),0) AS kwh, COUNT(*) AS sessions
     FROM sessions
     WHERE status IN ('COMPLETED','STOPPED')
       AND end_time >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [range - 1]
  );
  const [[revenueTotal]] = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total
     FROM transaction_logs
     WHERE type = 'CHARGING_FEE'
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [range - 1]
  );

  const energyKwh = Number(energyTotal.kwh);
  const sessions = Number(energyTotal.sessions);
  const revenue = Number(revenueTotal.total);
  const totals = {
    energyKwh,
    sessions,
    revenue,
    avgSessionKwh: sessions > 0 ? energyKwh / sessions : 0,
    co2SavedKg: energyKwh * CO2_FACTOR_KG_PER_KWH,
  };

  return {
    range,
    totals,
    energyByDay,
    revenueByDay,
    topupByDay,
    byHour,
    topUsers,
    channelUtil,
    stationPerf,
  };
}

async function getDashboard() {
  const [[revenue]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) AS total FROM transaction_logs WHERE type = "CHARGING_FEE"'
  );
  const [[topupSum]] = await pool.query(
    'SELECT COALESCE(SUM(amount),0) AS total FROM transaction_logs WHERE type = "TOPUP"'
  );
  const [[usersCount]] = await pool.query('SELECT COUNT(id) AS total FROM users WHERE role = "USER"');
  const [[activeCount]] = await pool.query('SELECT COUNT(id) AS total FROM sessions WHERE status = "ACTIVE"');

  const [channels] = await pool.query(
    `SELECT c.*, u.email AS current_user_email, u.full_name AS current_user_name,
            s.target_kwh, s.consumed_kwh,
            st.name AS station_name, st.city AS station_city,
            st.power_kw AS station_power_kw, st.type AS station_type
     FROM channels c
     LEFT JOIN users u ON c.current_user_id = u.id
     LEFT JOIN sessions s ON c.current_session_id = s.id
     LEFT JOIN stations st ON c.station_id = st.id
     ORDER BY c.id`
  );

  // Daftar stasiun (camelCase) untuk pemilih SPKLU di Monitor kanal.
  const stations = await stationService.listStations();

  // Daftar mesin SPKLU fisik (status online/offline, mode) untuk monitor admin.
  const devices = await deviceService.listDevices();

  const [logs] = await pool.query(
    `SELECT t.*, u.email, u.username FROM transaction_logs t
     JOIN users u ON t.user_id = u.id ORDER BY t.created_at DESC LIMIT 50`
  );

  const [trend] = await pool.query(
    `SELECT DATE(created_at) AS day, COALESCE(SUM(amount),0) AS total
     FROM transaction_logs
     WHERE type = 'CHARGING_FEE' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(created_at) ORDER BY day`
  );

  const topupRequests = await listTopupRequests();

  return {
    totalRevenue: Number(revenue.total),
    totalTopup: Number(topupSum.total),
    totalUsers: usersCount.total,
    activeSessions: activeCount.total,
    channels,
    stations,
    devices,
    logs,
    trend,
    topupRequests,
  };
}

module.exports = {
  listUsers, toggleStatus, getUserLogs, getAllLogs, topupByConsole,
  getDashboard, getAnalytics, listTopupRequests, decideTopupRequest,
};
