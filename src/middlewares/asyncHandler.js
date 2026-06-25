// Membungkus handler async agar error otomatis diteruskan ke errorHandler.
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
