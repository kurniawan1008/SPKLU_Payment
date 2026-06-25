// ============================================================================
// Data master SPKLU (Stasiun Pengisian Kendaraan Listrik Umum)
// Operator: CMW Universal Fast Charging — PT Cipta Mandiri Wirasakti.
//
// DEPRECATED sebagai sumber runtime: lokasi SPKLU kini disimpan di tabel
// `stations` (DB) dan dikelola admin lewat dashboard. File ini hanya
// dipertahankan sebagai referensi data seed awal (lihat db/schema.sql &
// db/migration_stations.sql). stationService.js TIDAK lagi mengimpornya.
//
// Setiap entri mengikuti kontrak Station persis:
//   { id, name, address, city, lat, lng, status, connectors, available,
//     powerKw, type, hours }
// - status   : 'ONLINE' | 'BUSY' | 'OFFLINE'
// - connectors: 2..6 ; available <= connectors
// - powerKw  : salah satu dari {60, 120, 150, 200}
// - type     : 'DC' | 'AC' | 'DC/AC'
// - hours    : mis. '24 Jam' atau '06.00 - 22.00'
// Koordinat memakai lokasi nyata di Jabodetabek, Bandung, dan Surabaya.
// ============================================================================

const stations = [
  {
    id: 1,
    name: 'CMW SPKLU Sudirman Hub',
    address: 'Jl. Jenderal Sudirman Kav. 52-53, Senayan',
    city: 'Jakarta Selatan',
    lat: -6.224935,
    lng: 106.809204,
    status: 'ONLINE',
    connectors: 6,
    available: 4,
    powerKw: 200,
    type: 'DC/AC',
    hours: '24 Jam',
  },
  {
    id: 2,
    name: 'CMW SPKLU Kelapa Gading',
    address: 'Jl. Boulevard Raya Blok M, Kelapa Gading Barat',
    city: 'Jakarta Utara',
    lat: -6.157835,
    lng: 106.907204,
    status: 'BUSY',
    connectors: 4,
    available: 0,
    powerKw: 150,
    type: 'DC',
    hours: '24 Jam',
  },
  {
    id: 3,
    name: 'CMW SPKLU BSD Green Office Park',
    address: 'Jl. BSD Grand Boulevard, BSD City, Sampora',
    city: 'Tangerang Selatan',
    lat: -6.301520,
    lng: 106.650169,
    status: 'ONLINE',
    connectors: 5,
    available: 3,
    powerKw: 120,
    type: 'DC/AC',
    hours: '06.00 - 23.00',
  },
  {
    id: 4,
    name: 'CMW SPKLU Bekasi Summarecon',
    address: 'Jl. Bulevar Selatan, Marga Mulya, Bekasi Utara',
    city: 'Bekasi',
    lat: -6.221540,
    lng: 107.001620,
    status: 'OFFLINE',
    connectors: 2,
    available: 0,
    powerKw: 60,
    type: 'AC',
    hours: '06.00 - 22.00',
  },
  {
    id: 5,
    name: 'CMW SPKLU Bogor Pajajaran',
    address: 'Jl. Raya Pajajaran No. 88, Baranangsiang',
    city: 'Bogor',
    lat: -6.601389,
    lng: 106.806458,
    status: 'ONLINE',
    connectors: 3,
    available: 2,
    powerKw: 120,
    type: 'DC',
    hours: '24 Jam',
  },
  {
    id: 6,
    name: 'CMW SPKLU Bandung Dago',
    address: 'Jl. Ir. H. Djuanda No. 165, Dago, Coblong',
    city: 'Bandung',
    lat: -6.884787,
    lng: 107.613144,
    status: 'BUSY',
    connectors: 4,
    available: 1,
    powerKw: 150,
    type: 'DC/AC',
    hours: '24 Jam',
  },
  {
    id: 7,
    name: 'CMW SPKLU Bandung Pasteur',
    address: 'Jl. Dr. Djunjunan No. 143-149, Sukabungah',
    city: 'Bandung',
    lat: -6.893703,
    lng: 107.578018,
    status: 'ONLINE',
    connectors: 2,
    available: 2,
    powerKw: 60,
    type: 'AC',
    hours: '07.00 - 21.00',
  },
  {
    id: 8,
    name: 'CMW SPKLU Surabaya Pakuwon',
    address: 'Jl. Mayjen Jonosewojo, Babatan, Wiyung',
    city: 'Surabaya',
    lat: -7.301140,
    lng: 112.674469,
    status: 'ONLINE',
    connectors: 6,
    available: 5,
    powerKw: 200,
    type: 'DC/AC',
    hours: '24 Jam',
  },
];

module.exports = stations;
