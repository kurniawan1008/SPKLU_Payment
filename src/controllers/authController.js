const asyncHandler = require('../middlewares/asyncHandler');
const authService = require('../services/authService');
const { ok } = require('../utils/response');

const register = asyncHandler(async (req, res) => {
  ok(res, await authService.register(req.body), 201);
});

const login = asyncHandler(async (req, res) => {
  ok(res, await authService.login(req.body));
});

module.exports = { register, login };
