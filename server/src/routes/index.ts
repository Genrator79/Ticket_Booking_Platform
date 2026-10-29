import { Router } from 'express';
import healthRoutes from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { movieRoutes } from './movie.routes.js';
import { venueRoutes } from './venue.routes.js';
import { showRoutes } from './show.routes.js';
import { bookingRoutes } from './booking.routes.js';

const apiRouter = Router();

apiRouter.use('/health', healthRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/movies', movieRoutes);
apiRouter.use('/venues', venueRoutes);
apiRouter.use('/shows', showRoutes);
apiRouter.use('/bookings', bookingRoutes);

export default apiRouter;
