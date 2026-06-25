const asyncHandler = require('../middlewares/asyncHandler');
const stationService = require('../services/stationService');
const { ok } = require('../utils/response');

// GET /api/stations — daftar SPKLU publik (tanpa autentikasi).
const getStations = asyncHandler(async (req, res) => ok(res, await stationService.listStations()));

// POST /api/admin/stations — tambah stasiun (admin).
const createStation = asyncHandler(async (req, res) =>
  ok(res, await stationService.createStation(req.body), 201)
);

// PUT /api/admin/stations/:id — ubah stasiun (admin).
const updateStation = asyncHandler(async (req, res) =>
  ok(res, await stationService.updateStation(req.params.id, req.body))
);

// DELETE /api/admin/stations/:id — hapus stasiun (admin).
const deleteStation = asyncHandler(async (req, res) =>
  ok(res, await stationService.deleteStation(req.params.id))
);

module.exports = { getStations, createStation, updateStation, deleteStation };
