import { Request, Response, NextFunction } from 'express';
import { movieService } from '../services/movie.service.js';

export class MovieController {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { genre, search } = req.query;
      const movies = await movieService.getAllMovies({
        genre: typeof genre === 'string' ? genre : undefined,
        search: typeof search === 'string' ? search : undefined,
      });

      res.status(200).json({
        success: true,
        data: movies,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const movie = await movieService.getMovieById(id);

      res.status(200).json({
        success: true,
        data: movie,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const movie = await movieService.createMovie(req.body);

      res.status(201).json({
        success: true,
        message: 'Movie created successfully',
        data: movie,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updated = await movieService.updateMovie(id, req.body);

      res.status(200).json({
        success: true,
        message: 'Movie updated successfully',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await movieService.deleteMovie(id);

      res.status(200).json({
        success: true,
        message: 'Movie deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const movieController = new MovieController();
