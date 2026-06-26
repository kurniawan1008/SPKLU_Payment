const { makeValidator } = require('../utils/validate-helpers');

const adminTopupSchema = makeValidator({
  username: { required: true, maxLength: 255, label: 'Username/Email' },
  amount: { required: true, type: 'number', min: 1, max: 100000000, label: 'Nominal' },
});

const overrideStopSchema = makeValidator({
  sessionId: { required: true, maxLength: 100, label: 'ID sesi' },
});

const deviceModeSchema = makeValidator({
  mode: { required: true, enum: ['ONLINE', 'OFFLINE'], label: 'Mode' },
});

// Pendaftaran mesin baru: nama + stasiun (opsional) + jumlah konektor (1..3,
// sesuai dukungan firmware XY12550S). device_key dibuat server, bukan dari input.
const deviceCreateSchema = makeValidator({
  name: { required: true, maxLength: 255, label: 'Nama mesin' },
  stationId: { type: 'number', min: 1, label: 'Stasiun' },
  connectors: { required: true, type: 'number', min: 1, max: 3, label: 'Jumlah konektor' },
});

// Ubah mesin: nama + stasiun. Jumlah konektor tidak diubah di sini (hindari
// pembuatan/penghapusan kanal yang bisa memengaruhi riwayat sesi).
const deviceUpdateSchema = makeValidator({
  name: { required: true, maxLength: 255, label: 'Nama mesin' },
  stationId: { type: 'number', min: 1, label: 'Stasiun' },
});

module.exports = {
  adminTopupSchema, overrideStopSchema, deviceModeSchema,
  deviceCreateSchema, deviceUpdateSchema,
};
