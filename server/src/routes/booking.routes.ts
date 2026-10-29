import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.js';
import { createBookingSchema } from '../validations/booking.validation.js';

const router = Router();

// All booking routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking for selected seats
 * @access  Private
 */
router.post('/', validateBody(createBookingSchema), (req, res, next) =>
  bookingController.create(req, res, next)
);

/**
 * @route   GET /api/bookings
 * @desc    Get booking history for authenticated user
 * @access  Private
 */
router.get('/', (req, res, next) => bookingController.getMyBookings(req, res, next));

/**
 * @route   GET /api/bookings/:id
 * @desc    Get booking confirmation and details by ID
 * @access  Private (Owner or Admin)
 */
router.get('/:id', (req, res, next) => bookingController.getById(req, res, next));

export const bookingRoutes = router;

