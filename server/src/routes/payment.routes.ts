import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import {
  bookingIdParamSchema,
  paymentIdParamSchema,
  processPaymentSchema,
  refundPaymentSchema,
} from '../validations/payment.validation.js';

const router = Router();

// Webhook endpoint: Public, verified via provider signature
router.post('/webhook', (req, res, next) =>
  paymentController.handleWebhook(req, res).catch(next)
);

// Authenticated payment endpoints
router.post('/process', authenticate, validateBody(processPaymentSchema), (req, res, next) =>
  paymentController.processPayment(req, res).catch(next)
);

router.get('/:id', authenticate, validateParams(paymentIdParamSchema), (req, res, next) =>
  paymentController.getPayment(req, res).catch(next)
);

router.get(
  '/booking/:bookingId',
  authenticate,
  validateParams(bookingIdParamSchema),
  (req, res, next) => paymentController.getPaymentsByBooking(req, res).catch(next)
);

router.post(
  '/:id/refund',
  authenticate,
  validateParams(paymentIdParamSchema),
  validateBody(refundPaymentSchema),
  (req, res, next) => paymentController.refundPayment(req, res).catch(next)
);

export const paymentRoutes = router;

