import { Router } from 'express';
import { venueController } from '../controllers/venue.controller.js';
import { validateBody } from '../middleware/validate.js';
import { createScreenSchema, createVenueSchema } from '../validations/entities.validation.js';

const router = Router();

router.get('/', (req, res, next) => venueController.getAll(req, res, next));
router.get('/:id', (req, res, next) => venueController.getById(req, res, next));
router.post('/', validateBody(createVenueSchema), (req, res, next) => venueController.create(req, res, next));
router.post('/:venueId/screens', validateBody(createScreenSchema), (req, res, next) =>
  venueController.createScreen(req, res, next)
);
router.get('/screens/:screenId/seats', (req, res, next) =>
  venueController.getScreenSeats(req, res, next)
);

export const venueRoutes = router;
