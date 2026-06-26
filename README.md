# SPKLU · CMW Universal Fast Charging — Sistem Pembayaran Pengisian Daya

Platform pengisian daya (SPKLU) dengan telemetri realtime, dompet saldo, dan dashboard admin.
Dibangun ulang dengan arsitektur **MVC backend (Express + MySQL)** dan **frontend SPA (React + Vite)**.

## Arsitektur

```
spklu/
├── server.js               # Entry point: HTTP + WebSocket + graceful shutdown
├── .env                    # Konfigurasi (DB, JWT, CORS, tarif)
├── src/                    # ===== BACKEND (MVC) =====
│   ├── app.js              # Setup Express (helmet, cors, rate-limit, static SPA)
│   ├── config/
│   │   ├── env.js          # Konfigurasi terpusat + validasi env
│   │   └── db.js           # Pool koneksi MySQL (mysql2/promise)
│   ├── controllers/        # Handler tipis → memanggil service
│   ├── services/           # Logika bisnis + transaksi DB (auth/user/admin/charging)
│   ├── middlewares/        # auth, validate, asyncHandler, errorHandler
│   ├── validators/         # Skema validasi deklaratif (tanpa dependency)
│   ├── routes/             # Definisi endpoint REST
│   ├── sockets/            # WebSocket + mesin simulasi telemetri (1 dtk)
│   └── utils/              # ApiError, logger, response, validate-helpers
└── client/                 # ===== FRONTEND (React + Vite) =====
    ├── vite.config.js      # Proxy /api & /socket.io → backend :3000
    └── src/
        ├── pages/          # Login, Register, Dashboard, Admin
        ├── components/ui/  # Button, Card, Input, Modal, Badge, Skeleton, dst.
        ├── components/layout/  # AppLayout (sidebar + topbar + drawer)
        ├── components/charging/  # ChargingVisual (animasi pengisian realtime)
        ├── components/stations/  # Peta & kartu lokasi SPKLU
        ├── styles/         # admin.css, dashboard.css (gaya halaman spesifik)
        ├── context/        # Theme, Auth, Toast (React Context)
        └── lib/            # api (fetch wrapper), socket, format, auth (JWT)
```

## Menjalankan

### Prasyarat
- Node.js 18+ dan MySQL (XAMPP) aktif dengan database `spklu_db`.
- Sesuaikan `.env` (kredensial DB, `JWT_SECRET`).

### Mode Produksi (satu server)
```bash
npm install            # dependency backend
npm run build          # install + build frontend → client/dist
npm start              # jalan di http://localhost:3000
```

### Mode Pengembangan (hot reload)
```bash
# Terminal 1 — backend (auto-restart saat file berubah)
npm run dev

# Terminal 2 — frontend (Vite dev server + HMR)
npm run client:dev     # buka http://localhost:5173
```

## API singkat

| Method | Endpoint | Akses | Keterangan |
|--------|----------|-------|------------|
| GET  | `/api/health` | publik | Health check |
| POST | `/api/auth/register` | publik | Registrasi |
| POST | `/api/auth/login` | publik | Login → JWT |
| GET  | `/api/channels` | publik | Daftar kanal |
| GET  | `/api/user/profile` | user | Profil + sesi aktif |
| PUT  | `/api/user/profile` | user | Ubah profil |
| POST | `/api/user/topup` | user | Isi saldo |
| GET  | `/api/transactions` | user | Riwayat |
| POST | `/api/charging/start` | user | Mulai pengisian |
| POST | `/api/charging/stop` | user | Hentikan pengisian |
| GET  | `/api/stations` | publik | Daftar lokasi SPKLU (peta) |
| GET  | `/api/admin/dashboard` | admin | Metrik + tren + kanal |
| GET  | `/api/admin/analytics` | admin | Analitik energi/transaksi (param `?days=14`) |
| GET  | `/api/admin/users` | admin | Daftar pengguna |
| POST | `/api/admin/users/:id/toggle-status` | admin | Suspend/aktifkan |
| POST | `/api/admin/topup` | admin | Top up via dashboard |
| POST | `/api/admin/channel/override-stop` | admin | Putus paksa konektor |

Semua respons memakai envelope konsisten: `{ "success": true, "data": ... }` atau
`{ "success": false, "message": "...", "errors": {...} }`.

### Endpoint baru
- **`GET /api/stations`** (publik, tanpa auth) — daftar lokasi SPKLU
  (`name`, `address`, `city`, `lat`, `lng`, `status`, `connectors`, `available`, `powerKw`, `type`, `hours`).
  Dipakai halaman **Lokasi SPKLU** (peta Google embed + deep link rute).
- **`GET /api/admin/analytics?days=7|14|30`** (admin) — analitik lengkap:
  totals (energi/sesi/pendapatan/CO₂), tren harian, distribusi per jam, pengguna teratas,
  utilisasi kanal, dan **`stationPerf`** — performa per titik SPKLU (energi, sesi, pendapatan,
  utilisasi konektor), digabung dari sesi nyata + metadata stasiun.
- **`GET /api/admin/dashboard`** (admin) — kini menyertakan `stations[]` untuk pemilih SPKLU
  di Monitor kanal, kolom `station_*` di tiap baris `channels[]`, dan `devices[]` (mesin fisik).
- **`GET /api/admin/devices`** (admin) — daftar mesin SPKLU fisik (online, mode, stasiun, kanal).
- **`POST /api/admin/devices/:id/mode`** (admin) — set mode mesin `ONLINE` (PAYMENT) / `OFFLINE` (FREE).
- **`POST /api/admin/devices/:id/clear`** (admin) — kirim clear-fault ke konektor mesin.

## Integrasi mesin fisik (ESP32 XY12550S)

Mesin SPKLU nyata tersambung lewat jembatan **Serial ↔ Socket.IO**:

```
[ESP32 Rev8.2] --USB serial 115200--> [gateway/ (PC/RasPi)] --Socket.IO /device--> [Server]
```

- **Firmware & protokol:** `SPKLU_esp32/INTEGRATION.md` (perintah `$...` turun, event `#...` naik).
- **Gateway:** folder [`gateway/`](gateway/) — relay bodoh tahan-banting (auto-reconnect serial & socket).
- **Server:** namespace `/device` (auth `device_key`), telemetri & settle dari kWh **asli** mesin
  (`#EVT session_complete`), bukan simulasi. Kanal terikat mesin tak disimulasikan.
- **Admin:** tab **Mesin SPKLU** memantau status online, V/A/kW per konektor, suhu, proteksi,
  dengan kontrol mode (FREE/PAYMENT) & clear-fault.

## Database

### Install baru
```bash
mysql -u spklu -p spklu_db < db/schema.sql
```

### Database yang sudah ada — jalankan migrasi secara berurutan
```bash
mysql -u spklu -p spklu_db < db/migration_stations.sql
mysql -u spklu -p spklu_db < db/migration_topup_requests.sql
mysql -u spklu -p spklu_db < db/migration_channel_station.sql
mysql -u spklu -p spklu_db < db/migration_devices.sql      # integrasi mesin fisik
```
Setiap skrip migrasi bersifat **idempoten** (aman dijalankan ulang; kolom/constraint dicek via
`information_schema` sebelum ditambahkan). **Penting:** setelah `migration_devices.sql`, ganti
`device_key` default (`CHANGE_ME_DEVICE_KEY`) dengan token acak rahasia.

## Peningkatan utama
- **Backend:** MVC, error handler terpusat, validasi input, JWT via env,
  CORS whitelist, rate limiting, health check, graceful shutdown, transaksi DB atomik.
- **Frontend:** SPA React, design system (dark/light), realtime WebSocket, chart,
  skeleton loading, empty state, animasi, routing terproteksi berbasis peran.
- **Fitur:** Lokasi SPKLU (peta + status konektor + rute), Monitor kanal dengan dropdown
  per titik SPKLU (metadata daya/tipe + kanal nyata + konektor turunan), tab Analitik admin
  (tren energi/pendapatan, distribusi per jam, pengguna teratas, utilisasi kanal,
  grafik & tabel performa per titik SPKLU).
