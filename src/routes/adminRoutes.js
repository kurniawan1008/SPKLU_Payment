const router = require('express').Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const {
  adminTopupSchema, overrideStopSchema, deviceModeSchema,
  deviceCreateSchema, deviceUpdateSchema,
} = require('../validators/adminValidators');
const ctrl = require('../controllers/adminController');

// Guard admin per-rute (login + peran ADMIN).
const admin = [authenticate, authorize('ADMIN')];

router.get('/admin/dashboard', admin, ctrl.dashboard);
router.get('/admin/analytics', admin, ctrl.analytics);
router.get('/admin/users', admin, ctrl.listUsers);
router.post('/admin/users/:id/toggle-status', admin, ctrl.toggleStatus);
router.get('/admin/users/:id/logs', admin, ctrl.getUserLogs);
router.get('/admin/logs', admin, ctrl.getAllLogs);
router.post('/admin/topup', admin, validate(adminTopupSchema), ctrl.topup);
router.post('/admin/topup-requests/:id/approve', admin, ctrl.approveTopup);
router.post('/admin/topup-requests/:id/reject', admin, ctrl.rejectTopup);
router.post('/admin/channel/override-stop', admin, validate(overrideStopSchema), ctrl.overrideStop);

// Kontrol mesin SPKLU (gateway ESP32).
router.get('/admin/devices', admin, ctrl.listDevices);
router.post('/admin/devices', admin, validate(deviceCreateSchema), ctrl.createDevice);
router.put('/admin/devices/:id', admin, validate(deviceUpdateSchema), ctrl.updateDevice);
router.delete('/admin/devices/:id', admin, ctrl.deleteDevice);
router.get('/admin/devices/:id/key', admin, ctrl.revealDeviceKey);
router.post('/admin/devices/:id/regenerate-key', admin, ctrl.regenerateDeviceKey);
router.post('/admin/devices/:id/mode', admin, validate(deviceModeSchema), ctrl.setDeviceMode);
router.post('/admin/devices/:id/clear', admin, ctrl.clearDeviceFault);

module.exports = router;
