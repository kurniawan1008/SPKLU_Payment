const { makeValidator } = require('../utils/validate-helpers');

const updateProfileSchema = makeValidator({
  full_name: { required: true, maxLength: 255, label: 'Nama lengkap' },
  username: { required: true, minLength: 3, maxLength: 50, label: 'Nama pengguna' },
  npk: { required: true, maxLength: 50, label: 'NPK' },
  phone: { required: true, maxLength: 20, label: 'Nomor telepon' },
  email: { required: true, type: 'email', maxLength: 255, label: 'Email' },
});

const topupSchema = makeValidator({
  amount: { required: true, type: 'number', min: 1, max: 10000000, label: 'Nominal' },
});

const startChargingSchema = makeValidator({
  channelId: { required: true, type: 'number', min: 1, label: 'Kanal' },
  mode: { required: true, enum: ['KWH', 'RUPIAH'], label: 'Mode' },
  amount: { required: true, type: 'number', min: 1, label: 'Target' },
});

const stopChargingSchema = makeValidator({
  sessionId: { required: true, maxLength: 100, label: 'ID sesi' },
});

module.exports = { updateProfileSchema, topupSchema, startChargingSchema, stopChargingSchema };
