const { makeValidator } = require('../utils/validate-helpers');

const adminTopupSchema = makeValidator({
  username: { required: true, label: 'Username/Email' },
  amount: { required: true, type: 'number', min: 1, max: 100000000, label: 'Nominal' },
});

const overrideStopSchema = makeValidator({
  sessionId: { required: true, label: 'ID sesi' },
});

const deviceModeSchema = makeValidator({
  mode: { required: true, enum: ['ONLINE', 'OFFLINE'], label: 'Mode' },
});

module.exports = { adminTopupSchema, overrideStopSchema, deviceModeSchema };
