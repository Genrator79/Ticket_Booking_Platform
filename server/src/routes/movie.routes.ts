import { Router } from 'express';
import { movieController } from '../controllers/movie.controller.js';
import { validateBody } from '../middleware/validate.js';
import { createMovieSchema, updateMovieSchema } from '../validations/entities.validation.js';

const router = Router();

router.get('/', (req, res, next) => movieController.getAll(req, res, next));
router.get('/:id', (req, res, next) => movieController.getById(req, res, next));
router.post('/', validateBody(createMovieSchema), (req, res, next) => movieController.create(req, res, next));
router.put('/:id', validateBody(updateMovieSchema), (req, res, next) => movieController.update(req, res, next));
router.delete('/:id', (req, res, next) => movieController.delete(req, res, next));

export const movieRoutes = router;

