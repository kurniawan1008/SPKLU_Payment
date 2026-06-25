const { makeValidator } = require('../utils/validate-helpers');

// Nilai enum yang diizinkan untuk stasiun SPKLU.
const STATUS = ['ONLINE', 'BUSY', 'OFFLINE'];
const TYPES = ['DC', 'AC', 'DC/AC'];

// Skema input stasiun (dipakai create POST & update PUT — form mengirim semua field).
// available di-clamp ke [0, connectors] di service, jadi cukup validasi rentang dasar.
const stationSchema = makeValidator({
  name: { required: true, label: 'Nama stasiun' },
  address: { required: true, label: 'Alamat' },
  city: { required: true, label: 'Kota' },
  lat: { required: true, type: 'number', min: -90, max: 90, label: 'Lintang (lat)' },
  lng: { required: true, type: 'number', min: -180, max: 180, label: 'Bujur (lng)' },
  status: { type: 'string', enum: STATUS, default: 'ONLINE', label: 'Status' },
  connectors: { required: true, type: 'number', min: 1, max: 50, label: 'Jumlah konektor' },
  available: { type: 'number', min: 0, max: 50, default: 0, label: 'Konektor tersedia' },
  powerKw: { required: true, type: 'number', min: 1, max: 1000, label: 'Daya (kW)' },
  type: { type: 'string', enum: TYPES, default: 'DC', label: 'Tipe konektor' },
  hours: { default: '24 Jam', label: 'Jam operasional' },
});

module.exports = { stationSchema, STATUS, TYPES };
