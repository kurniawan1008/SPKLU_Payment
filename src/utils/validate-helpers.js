// Validator deklaratif tanpa dependency eksternal.
// Tiap rule: { required, type:'email'|'number'|'string', min, max, minLength, enum, default, label }
const ApiError = require('./ApiError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function makeValidator(rules) {
  return (data = {}) => {
    const errors = {};
    const out = {};

    for (const [field, rule] of Object.entries(rules)) {
      let val = data[field];
      if (typeof val === 'string') val = val.trim();

      const isEmpty = val === undefined || val === null || val === '';

      if (isEmpty) {
        if (rule.required) { errors[field] = `${rule.label || field} wajib diisi`; continue; }
        if (rule.default !== undefined) out[field] = rule.default;
        continue;
      }

      if (rule.type === 'email' && !EMAIL_RE.test(val)) {
        errors[field] = 'Format email tidak valid'; continue;
      }

      if (rule.type === 'number') {
        const n = Number(val);
        if (Number.isNaN(n)) { errors[field] = `${rule.label || field} harus berupa angka`; continue; }
        if (rule.min !== undefined && n < rule.min) { errors[field] = `${rule.label || field} minimal ${rule.min}`; continue; }
        if (rule.max !== undefined && n > rule.max) { errors[field] = `${rule.label || field} maksimal ${rule.max}`; continue; }
        out[field] = n; continue;
      }

      if (rule.minLength && String(val).length < rule.minLength) {
        errors[field] = `${rule.label || field} minimal ${rule.minLength} karakter`; continue;
      }

      if (rule.enum && !rule.enum.includes(val)) {
        errors[field] = `${rule.label || field} tidak valid`; continue;
      }

      out[field] = val;
    }

    if (Object.keys(errors).length) {
      throw ApiError.badRequest('Validasi gagal. Periksa kembali data Anda.', errors);
    }
    return out;
  };
}

module.exports = { makeValidator };
