const router = require('express').Router();

// Health check untuk monitoring/uptime.
router.get('/health', (req, res) =>
  res.json({
    success: true,
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  })
);

router.use('/auth', require('./authRoutes'));
router.use('/', require('./stationRoutes'));
router.use('/', require('./userRoutes'));
router.use('/', require('./adminRoutes'));

module.exports = router;
