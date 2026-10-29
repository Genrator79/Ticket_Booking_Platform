import { ShowRepository, showRepository } from '../repositories/show.repository.js';
import { MovieRepository, movieRepository } from '../repositories/movie.repository.js';
import { VenueRepository, venueRepository } from '../repositories/venue.repository.js';
import { CreateShowDTO, Show, ShowSeatWithLayout, ShowWithDetails } from '../types/entities.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class ShowService {
  constructor(
    private repo: ShowRepository = showRepository,
    private movieRepo: MovieRepository = movieRepository,
    private venueRepo: VenueRepository = venueRepository
  ) {}

  async getAllShows(filters?: { movieId?: string; date?: string }): Promise<ShowWithDetails[]> {
    return this.repo.findAll(filters);
  }

  async getShowById(id: string): Promise<ShowWithDetails> {
    const show = await this.repo.findById(id);
    if (!show) {
      throw new NotFoundError(`Show with ID ${id} not found`);
    }
    return show;
  }

  async createShow(data: CreateShowDTO): Promise<Show> {
    const movie = await this.movieRepo.findById(data.movie_id);
    if (!movie) {
      throw new NotFoundError(`Movie with ID ${data.movie_id} not found`);
    }

    const screen = await this.venueRepo.findScreenById(data.screen_id);
    if (!screen) {
      throw new NotFoundError(`Screen with ID ${data.screen_id} not found`);
    }

    const start = new Date(data.start_time);
    const end = new Date(data.end_time);
    if (end <= start) {
      throw new BadRequestError('Show end_time must be strictly after start_time');
    }

    return this.repo.create(data);
  }

  /**
   * Retrieves seat layout and real-time availability for a given show.
   * Requirement from Section 11 of the system specification.
   */
  async getShowSeatsLayout(showId: string): Promise<{ showId: string; totalSeats: number; availableSeats: number; seats: ShowSeatWithLayout[] }> {
    const show = await this.repo.findById(showId);
    if (!show) {
      throw new NotFoundError(`Show with ID ${showId} not found`);
    }

    const seats = await this.repo.getShowSeats(showId);
    const availableSeats = seats.filter((s) => s.status === 'AVAILABLE').length;

    return {
      showId,
      totalSeats: seats.length,
      availableSeats,
      seats,
    };
  }
}

export const showService = new ShowService();

