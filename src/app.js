const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const config = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

function createApp() {
  const app = express();

  // Di belakang reverse proxy (Nginx) — agar req.ip & rate-limit memakai IP klien asli
  // dari header X-Forwarded-For, bukan IP proxy. Hanya percayai 1 hop (Nginx).
  if (config.isProd) app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: config.allowedOrigins }));
  app.use(express.json());

  // Rate limit hanya untuk API.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak permintaan. Coba lagi nanti.' },
  });

  app.use('/api', apiLimiter, routes);
  app.use('/api', notFoundHandler); // API 404

  // ===== Frontend React (hasil build Vite) =====
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');
  app.use(express.static(clientDist));

  // SPA fallback untuk semua rute non-API (Express 5 compatible).
  app.get(/^(?!\/api).*/, (req, res, next) => {
    if (fs.existsSync(indexHtml)) return res.sendFile(indexHtml);
    res
      .status(200)
      .type('html')
      .send(
        `<pre style="font-family:monospace;padding:2rem;line-height:1.6">
SPKLU API aktif ✅  (frontend belum di-build)

Pengembangan : jalankan Vite dev server →  cd client && npm run dev   (http://localhost:5173)
Produksi     : build dulu →                cd client && npm run build  lalu buka http://localhost:${config.port}
Health check : GET /api/health
</pre>`
      );
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
