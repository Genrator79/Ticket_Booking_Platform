import { Router } from 'express';
import { showController } from '../controllers/show.controller.js';
import { validateBody } from '../middleware/validate.js';
import { createShowSchema } from '../validations/entities.validation.js';

const router = Router();

router.get('/', (req, res, next) => showController.getAll(req, res, next));
router.get('/:id', (req, res, next) => showController.getById(req, res, next));
router.post('/', validateBody(createShowSchema), (req, res, next) => showController.create(req, res, next));

/**
 * Section 11: GET /api/shows/:showId/seats
 */
router.get('/:showId/seats', (req, res, next) => showController.getSeats(req, res, next));

export const showRoutes = router;

