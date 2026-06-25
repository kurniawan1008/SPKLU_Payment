const router = require('express').Router();
const validate = require('../middlewares/validate');
const { authenticate, authorize } = require('../middlewares/auth');
const { stationSchema } = require('../validators/stationValidators');
const ctrl = require('../controllers/stationController');

// Guard admin per-rute (login + peran ADMIN).
const admin = [authenticate, authorize('ADMIN')];

// Rute publik: daftar SPKLU (tanpa autentikasi).
router.get('/stations', ctrl.getStations);

// Rute admin: kelola lokasi SPKLU dari Dashboard Admin.
router.post('/admin/stations', admin, validate(stationSchema), ctrl.createStation);
router.put('/admin/stations/:id', admin, validate(stationSchema), ctrl.updateStation);
router.delete('/admin/stations/:id', admin, ctrl.deleteStation);

module.exports = router;
