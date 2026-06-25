const router = require('express').Router();
const validate = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const v = require('../validators/userValidators');
const ctrl = require('../controllers/userController');

// Publik — daftar kanal bisa dilihat tanpa login.
router.get('/channels', ctrl.getChannels);

// Terproteksi (auth per-rute agar rute tak dikenal jatuh ke 404, bukan 401).
router.get('/user/profile', authenticate, ctrl.getProfile);
router.put('/user/profile', authenticate, validate(v.updateProfileSchema), ctrl.updateProfile);
router.post('/user/topup', authenticate, validate(v.topupSchema), ctrl.topup);
router.get('/transactions', authenticate, ctrl.getTransactions);
router.post('/charging/start', authenticate, validate(v.startChargingSchema), ctrl.startCharging);
router.post('/charging/stop', authenticate, validate(v.stopChargingSchema), ctrl.stopCharging);

module.exports = router;
