const asyncHandler = require('../middlewares/asyncHandler');
const adminService = require('../services/adminService');
const chargingService = require('../services/chargingService');
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
  ok(res, await chargingService.settleSession(req.body.sessionId, true, req.app.get('io')))
);

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
};
