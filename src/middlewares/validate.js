// Menjalankan validator pada bagian request tertentu (default: body)
// dan mengganti isinya dengan data yang sudah dibersihkan.
module.exports = (validator, source = 'body') => (req, res, next) => {
  try {
    req[source] = validator(req[source] || {});
    next();
  } catch (err) {
    next(err);
  }
};
