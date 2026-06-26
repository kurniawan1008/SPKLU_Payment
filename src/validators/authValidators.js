const { makeValidator } = require('../utils/validate-helpers');

const registerSchema = makeValidator({
  email: { required: true, type: 'email', maxLength: 255, label: 'Email' },
  password: { required: true, minLength: 6, maxLength: 255, label: 'Kata sandi' },
  full_name: { required: true, maxLength: 255, label: 'Nama lengkap' },
  username: { required: true, minLength: 3, maxLength: 50, label: 'Nama pengguna' },
  npk: { required: true, maxLength: 50, label: 'NPK' },
  phone: { required: true, maxLength: 20, label: 'Nomor telepon' },
});

const loginSchema = makeValidator({
  email: { required: true, type: 'email', maxLength: 255, label: 'Email' },
  password: { required: true, maxLength: 255, label: 'Kata sandi' },
});

module.exports = { registerSchema, loginSchema };
