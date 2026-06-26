const { makeValidator } = require('../utils/validate-helpers');

// Nilai enum yang diizinkan untuk stasiun SPKLU.
const STATUS = ['ONLINE', 'BUSY', 'OFFLINE'];
const TYPES = ['DC', 'AC', 'DC/AC'];

// Skema input stasiun (lokasi SPKLU). Jumlah konektor TIDAK lagi diisi di sini —
// ditentukan oleh mesin/channel yang terdaftar (tab Mesin SPKLU). connectors/
// available tetap diterima opsional demi kompatibilitas, default 0.
const stationSchema = makeValidator({
  name: { required: true, maxLength: 255, label: 'Nama stasiun' },
  address: { required: true, maxLength: 500, label: 'Alamat' },
  city: { required: true, maxLength: 100, label: 'Kota' },
  lat: { required: true, type: 'number', min: -90, max: 90, label: 'Lintang (lat)' },
  lng: { required: true, type: 'number', min: -180, max: 180, label: 'Bujur (lng)' },
  status: { type: 'string', enum: STATUS, default: 'ONLINE', label: 'Status' },
  connectors: { type: 'number', min: 0, max: 50, default: 0, label: 'Jumlah konektor' },
  available: { type: 'number', min: 0, max: 50, default: 0, label: 'Konektor tersedia' },
  powerKw: { required: true, type: 'number', min: 1, max: 1000, label: 'Daya (kW)' },
  type: { type: 'string', enum: TYPES, default: 'DC', label: 'Tipe konektor' },
  hours: { default: '24 Jam', maxLength: 50, label: 'Jam operasional' },
});

module.exports = { stationSchema, STATUS, TYPES };
