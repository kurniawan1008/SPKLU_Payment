const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const config = require('../config/env');

// 404 untuk rute API yang tak dikenal.
function notFoundHandler(req, res, next) {
  next(ApiError.notFound(`Rute ${req.method} ${req.originalUrl} tidak ditemukan`));
}

// Penangan error terpusat — selalu mengembalikan envelope JSON konsisten.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let error = err;

  if (!(error instanceof ApiError)) {
    if (error.code === 'ER_DUP_ENTRY') {
      error = ApiError.conflict('Data sudah digunakan (duplikat).');
    } else if (error.type === 'entity.parse.failed') {
      error = ApiError.badRequest('Body JSON tidak valid.');
    } else {
      error = new ApiError(error.statusCode || 500, error.message || 'Kesalahan server internal');
    }
  }

  if (error.statusCode >= 500) {
    logger.error(`${error.message}`, error.stack);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.details ? { errors: error.details } : {}),
    ...(config.isProd ? {} : { stack: error.stack }),
  });
}

module.exports = { notFoundHandler, errorHandler };
