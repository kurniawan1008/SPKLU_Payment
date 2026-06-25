const logger = require('../utils/logger');
const { runTelemetrySimulation } = require('../services/chargingService');

// Inisialisasi WebSocket + mesin telemetri. Mengembalikan fungsi stop.
function initSockets(io) {
  io.on('connection', (socket) => {
    logger.debug(`WS terhubung: ${socket.id}`);

    // Room per-user agar telemetri tidak bocor ke pengguna lain.
    socket.on('join_session', (userId) => {
      if (userId != null) socket.join(`user_${userId}`);
    });

    // Room admin untuk broadcast metrik.
    socket.on('join_admin', () => socket.join('admin'));

    socket.on('disconnect', () => logger.debug(`WS terputus: ${socket.id}`));
  });

  const interval = setInterval(() => {
    runTelemetrySimulation(io).catch((err) => logger.error('Telemetry tick error:', err.message));
  }, 1000);

  return () => clearInterval(interval);
}

module.exports = { initSockets };
