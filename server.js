// Titik masuk aplikasi — bootstrap server HTTP + WebSocket.
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const config = require('./src/config/env');
const logger = require('./src/utils/logger');
const { assertConnection, pool } = require('./src/config/db');
const { createApp } = require('./src/app');
const { initSockets } = require('./src/sockets');

async function bootstrap() {
  await assertConnection();

  const app = createApp();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
  });

  // WebSocket authentication middleware — verify JWT sebelum connect.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));
    try {
      const decoded = jwt.verify(token, config.jwtSecret);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  app.set('io', io); // agar controller bisa akses lewat req.app.get('io')

  const stopTelemetry = initSockets(io);

  server.listen(config.port, () =>
    logger.info(`SPKLU server aktif → http://localhost:${config.port}  [${config.env}]`)
  );

  // Graceful shutdown.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn(`${signal} diterima — mematikan server dengan bersih...`);
    stopTelemetry();
    io.close();
    server.close(async () => {
      try { await pool.end(); } catch { /* abaikan */ }
      logger.info('Server berhenti. Sampai jumpa.');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection:', reason));
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.error('Gagal memulai server:', err.message);
  process.exit(1);
});
