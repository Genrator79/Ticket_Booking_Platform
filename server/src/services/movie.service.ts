import { MovieRepository, movieRepository } from '../repositories/movie.repository.js';
import { CreateMovieDTO, Movie, UpdateMovieDTO } from '../types/entities.js';
import { NotFoundError } from '../utils/errors.js';

export class MovieService {
  constructor(private repo: MovieRepository = movieRepository) {}

  async getAllMovies(filters?: { genre?: string; search?: string }): Promise<Movie[]> {
    return this.repo.findAll(filters);
  }

  async getMovieById(id: string): Promise<Movie> {
    const movie = await this.repo.findById(id);
    if (!movie) {
      throw new NotFoundError(`Movie with ID ${id} not found`);
    }
    return movie;
  }

  async createMovie(data: CreateMovieDTO): Promise<Movie> {
    return this.repo.create(data);
  }

  async updateMovie(id: string, data: UpdateMovieDTO): Promise<Movie> {
    const updated = await this.repo.update(id, data);
    if (!updated) {
      throw new NotFoundError(`Movie with ID ${id} not found`);
    }
    return updated;
  }

  async deleteMovie(id: string): Promise<void> {
    const deleted = await this.repo.delete(id);
    if (!deleted) {
      throw new NotFoundError(`Movie with ID ${id} not found`);
    }
  }
}

export const movieService = new MovieService();

