const { makeValidator } = require('../utils/validate-helpers');

const registerSchema = makeValidator({
  email: { required: true, type: 'email', label: 'Email' },
  password: { required: true, minLength: 6, label: 'Kata sandi' },
  full_name: { required: true, label: 'Nama lengkap' },
  username: { required: true, minLength: 3, label: 'Nama pengguna' },
  npk: { required: true, label: 'NPK' },
  phone: { required: true, label: 'Nomor telepon' },
});

const loginSchema = makeValidator({
  email: { required: true, type: 'email', label: 'Email' },
  password: { required: true, label: 'Kata sandi' },
});

module.exports = { registerSchema, loginSchema };
