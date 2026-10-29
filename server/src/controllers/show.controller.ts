import { Request, Response, NextFunction } from 'express';
import { showService } from '../services/show.service.js';

export class ShowController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { movieId, date } = req.query;
      const shows = await showService.getAllShows({
        movieId: typeof movieId === 'string' ? movieId : undefined,
        date: typeof date === 'string' ? date : undefined,
      });

      res.status(200).json({
        success: true,
        data: shows,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const show = await showService.getShowById(id);

      res.status(200).json({
        success: true,
        data: show,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const show = await showService.createShow(req.body);

      res.status(201).json({
        success: true,
        message: 'Show scheduled successfully with seat availability records',
        data: show,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Section 11: GET /api/shows/:showId/seats
   * Returns complete seat grid layout with real-time status (AVAILABLE/HELD/BOOKED).
   */
  async getSeats(req: Request, res: Response, next: NextFunction) {
    try {
      const { showId } = req.params;
      const result = await showService.getShowSeatsLayout(showId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const showController = new ShowController();
