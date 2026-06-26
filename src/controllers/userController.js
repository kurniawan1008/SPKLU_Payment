const asyncHandler = require('../middlewares/asyncHandler');
const userService = require('../services/userService');
const chargingService = require('../services/chargingService');
const { ok } = require('../utils/response');

const getProfile = asyncHandler(async (req, res) => ok(res, await userService.getProfile(req.user.id)));
const updateProfile = asyncHandler(async (req, res) => ok(res, await userService.updateProfile(req.user.id, req.body)));
const getChannels = asyncHandler(async (req, res) => ok(res, await userService.getChannels()));
const topup = asyncHandler(async (req, res) => {
  const result = await userService.requestTopup(req.user.id, req.body.amount);
  const io = req.app.get('io');
  if (io) io.to('admin').emit('admin_metrics_update', { event: 'TOPUP_REQUESTED' });
  ok(res, result);
});
const getTransactions = asyncHandler(async (req, res) => ok(res, await userService.getTransactions(req.user.id)));

const startCharging = asyncHandler(async (req, res) =>
  ok(res, await chargingService.startCharging(req.user.id, req.body, req.app.get('io')))
);
const stopCharging = asyncHandler(async (req, res) =>
  ok(res, await chargingService.stopByUser(req.user.id, req.body.sessionId, req.app.get('io')))
);

module.exports = { getProfile, updateProfile, getChannels, topup, getTransactions, startCharging, stopCharging };
