const router = require('express').Router();
const validate = require('../middlewares/validate');
const { registerSchema, loginSchema } = require('../validators/authValidators');
const ctrl = require('../controllers/authController');

router.post('/register', validate(registerSchema), ctrl.register);
router.post('/login', validate(loginSchema), ctrl.login);

module.exports = router;
