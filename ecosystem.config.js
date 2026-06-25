// Konfigurasi PM2 — manajemen proses produksi.
//   pm2 start ecosystem.config.js
//   pm2 save && pm2 startup     (agar otomatis hidup saat server reboot)
//
// PENTING: instances = 1 (fork). Aplikasi punya mesin telemetri yang berjalan
// tiap 1 detik + WebSocket; menjalankan banyak instance (cluster) akan menggandakan
// tick telemetri dan memecah koneksi socket. Jangan dijalankan multi-instance
// tanpa Redis adapter + sticky session.
module.exports = {
  apps: [
    {
      name: 'spklu',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      env: {
        NODE_ENV: 'production',
      },
      // File .env tetap dibaca oleh dotenv di dalam aplikasi.
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
