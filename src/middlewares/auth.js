const jwt = require('jsonwebtoken');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

// Verifikasi JWT dan tempelkan payload ke req.user.
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(ApiError.unauthorized('Token akses tidak ditemukan.'));

  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    // 401 Unauthorized untuk token invalid/expired, bukan 403 Forbidden.
    next(ApiError.unauthorized('Token tidak valid atau telah kedaluwarsa.'));
  }
}

// Membatasi akses berdasarkan peran, mis. authorize('ADMIN').
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('Anda tidak memiliki hak akses untuk tindakan ini.'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
