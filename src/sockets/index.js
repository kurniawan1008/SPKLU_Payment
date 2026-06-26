const logger = require('../utils/logger');
const { runTelemetrySimulation } = require('../services/chargingService');
const { initDeviceGateway } = require('./deviceGateway');
const deviceService = require('../services/deviceService');

// Inisialisasi WebSocket + mesin telemetri. Mengembalikan fungsi stop.
function initSockets(io) {
  io.on('connection', (socket) => {
    logger.debug(`WS terhubung: ${socket.id}`);

    // Room per-user agar telemetri tidak bocor ke pengguna lain.
    socket.on('join_session', (userId) => {
      if (userId != null) socket.join(`user_${userId}`);
    });

    // Room admin untuk broadcast metrik + monitor mesin.
    socket.on('join_admin', () => socket.join('admin'));

    socket.on('disconnect', () => logger.debug(`WS terputus: ${socket.id}`));
  });

  // Namespace khusus gateway mesin SPKLU (ESP32).
  initDeviceGateway(io);
  // Reset status online (jaga-jaga bila proses sebelumnya mati tanpa disconnect bersih).
  deviceService.markAllOffline().catch((err) => logger.error('markAllOffline gagal:', err.message));

  const interval = setInterval(() => {
    runTelemetrySimulation(io).catch((err) => logger.error('Telemetry tick error:', err.message));
  }, 1000);

  return () => clearInterval(interval);
}

module.exports = { initSockets };
