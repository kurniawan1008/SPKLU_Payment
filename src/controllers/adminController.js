const asyncHandler = require('../middlewares/asyncHandler');
const adminService = require('../services/adminService');
const chargingService = require('../services/chargingService');
const deviceService = require('../services/deviceService');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');

const listUsers = asyncHandler(async (req, res) => ok(res, await adminService.listUsers()));
const toggleStatus = asyncHandler(async (req, res) => ok(res, await adminService.toggleStatus(req.params.id)));
const getUserLogs = asyncHandler(async (req, res) => ok(res, await adminService.getUserLogs(req.params.id)));
const getAllLogs = asyncHandler(async (req, res) => ok(res, await adminService.getAllLogs()));
const topup = asyncHandler(async (req, res) => ok(res, await adminService.topupByConsole(req.body)));
const dashboard = asyncHandler(async (req, res) => ok(res, await adminService.getDashboard()));
const analytics = asyncHandler(async (req, res) =>
  ok(res, await adminService.getAnalytics(Number(req.query.days) || 14))
);

const overrideStop = asyncHandler(async (req, res) =>
  ok(res, await chargingService.requestStop(req.body.sessionId, req.app.get('io')))
);

// ===== Kontrol mesin SPKLU (gateway ESP32) =====
const listDevices = asyncHandler(async (req, res) => ok(res, await deviceService.listDevices()));

// Daftarkan mesin baru (+ buat kanal/konektor). device_key dikembalikan SEKALI ini.
const createDevice = asyncHandler(async (req, res) => {
  const { name, stationId, connectors } = req.body;
  const device = await deviceService.createDevice({ name, stationId, connectors });
  const io = req.app.get('io');
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_ADDED', deviceId: device.id });
  ok(res, { message: `Mesin "${name}" terdaftar dengan ${device.connectors} konektor.`, device });
});

const updateDevice = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const device = await deviceService.getById(id);
  if (!device) throw ApiError.notFound('Mesin tidak ditemukan.');
  await deviceService.updateDevice(id, { name: req.body.name, stationId: req.body.stationId });
  const io = req.app.get('io');
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_UPDATED', deviceId: id });
  ok(res, { message: 'Mesin diperbarui.' });
});

const deleteDevice = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const device = await deviceService.getById(id);
  if (!device) throw ApiError.notFound('Mesin tidak ditemukan.');
  if (device.online) throw ApiError.conflict('Mesin sedang online — putuskan gateway dulu sebelum menghapus.');
  const active = await deviceService.countActiveSessions(id);
  if (active > 0) throw ApiError.conflict('Masih ada sesi pengisian aktif pada mesin ini.');
  await deviceService.deleteDevice(id);
  const io = req.app.get('io');
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_DELETED', deviceId: id });
  ok(res, { message: `Mesin "${device.name}" dihapus.` });
});

// Tampilkan device_key (on-demand) — agar tidak ikut di setiap polling dashboard.
const revealDeviceKey = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const key = await deviceService.getKey(id);
  if (key == null) throw ApiError.notFound('Mesin tidak ditemukan.');
  ok(res, { deviceKey: key });
});

const regenerateDeviceKey = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const device = await deviceService.getById(id);
  if (!device) throw ApiError.notFound('Mesin tidak ditemukan.');
  const deviceKey = await deviceService.regenerateKey(id);
  ok(res, { message: 'device_key dibuat ulang. Perbarui .env gateway.', deviceKey });
});

const setDeviceMode = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const mode = req.body.mode; // 'ONLINE' | 'OFFLINE'
  const device = await deviceService.getById(id);
  if (!device) throw ApiError.notFound('Mesin tidak ditemukan.');

  const io = req.app.get('io');
  deviceService.sendCommand(io, id, mode === 'ONLINE' ? '$SETONLINE' : '$SETOFFLINE');
  await deviceService.setMode(id, mode);
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'DEVICE_MODE', deviceId: id, mode });
  ok(res, { message: `Mode mesin diatur ke ${mode}.`, mode });
});

const clearDeviceFault = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const ch = Number(req.body.channel); // 1..3
  const device = await deviceService.getById(id);
  if (!device) throw ApiError.notFound('Mesin tidak ditemukan.');
  if (!(ch >= 1 && ch <= 3)) throw ApiError.badRequest('Nomor konektor tidak valid (1..3).');

  deviceService.sendCommand(req.app.get('io'), id, `$CLEAR,${ch}`);
  ok(res, { message: `Perintah clear dikirim ke konektor ${ch}.` });
});

const approveTopup = asyncHandler(async (req, res) => {
  const result = await adminService.decideTopupRequest(req.params.id, true);
  const io = req.app.get('io');
  if (io) {
    io.to(`user_${result.userId}`).emit('balance_update', { reason: 'TOPUP_APPROVED' });
    io.to('admin').emit('admin_metrics_update', { event: 'TOPUP_DECIDED' });
  }
  ok(res, result);
});

const rejectTopup = asyncHandler(async (req, res) => {
  const result = await adminService.decideTopupRequest(req.params.id, false);
  const io = req.app.get('io');
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'TOPUP_DECIDED' });
  ok(res, result);
});

module.exports = {
  listUsers, toggleStatus, getUserLogs, getAllLogs, topup, dashboard, analytics,
  overrideStop, approveTopup, rejectTopup,
  listDevices, createDevice, updateDevice, deleteDevice,
  revealDeviceKey, regenerateDeviceKey, setDeviceMode, clearDeviceFault,
};
