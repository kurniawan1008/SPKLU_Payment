const logger = require('../utils/logger');
const { runTelemetrySimulation } = require('../services/chargingService');
const { initDeviceGateway } = require('./deviceGateway');
const deviceService = require('../services/deviceService');

// Inisialisasi WebSocket + mesin telemetri. Mengembalikan fungsi stop.
function initSockets(io) {
  io.on('connection', (socket) => {
    const userId = socket.userId; // dari JWT auth middleware
    const userRole = socket.userRole;
    logger.debug(`WS terhubung: ${socket.id} (user ${userId})`);

    // Auto-join user room — gunakan userId dari JWT, bukan input klien.
    socket.join(`user_${userId}`);

    // Admin room — hanya role ADMIN yang boleh.
    socket.on('join_admin', () => {
      if (userRole === 'ADMIN') socket.join('admin');
      else logger.warn(`User ${userId} mencoba akses admin room tanpa otorisasi`);
    });

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
