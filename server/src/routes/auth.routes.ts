import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { loginSchema, registerSchema } from '../validations/auth.validation.js';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user account
 * @access  Public
 */
router.post('/register', validateBody(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user with credentials & issue JWT
 * @access  Public
 */
router.post('/login', validateBody(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current authenticated user profile
 * @access  Private (JWT required)
 */
router.get('/me', authenticate, (req, res, next) =>
  authController.getMe(req, res, next)
);

export const authRoutes = router;
