// Error operasional terstandar — dipakai di seluruh service & ditangani errorHandler.
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) { return new ApiError(400, message, details); }
  static unauthorized(message = 'Tidak terotorisasi') { return new ApiError(401, message); }
  static forbidden(message = 'Akses ditolak') { return new ApiError(403, message); }
  static notFound(message = 'Sumber daya tidak ditemukan') { return new ApiError(404, message); }
  static conflict(message = 'Konflik data') { return new ApiError(409, message); }
  static internal(message = 'Kesalahan server internal') { return new ApiError(500, message); }
}

module.exports = ApiError;
