import { Router } from 'express';
import { holdController } from '../controllers/hold.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createHoldSchema, holdIdParamSchema } from '../validations/hold.validation.js';

const router = Router();

// All hold routes require authentication
router.use(authenticate);

router.post('/', validateBody(createHoldSchema), (req, res, next) =>
  holdController.createHold(req, res).catch(next)
);

router.get('/:id', validateParams(holdIdParamSchema), (req, res, next) =>
  holdController.getHold(req, res).catch(next)
);

router.delete('/:id', validateParams(holdIdParamSchema), (req, res, next) =>
  holdController.releaseHold(req, res).catch(next)
);

export const holdRoutes = router;

