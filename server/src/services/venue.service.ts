import { VenueRepository, venueRepository } from '../repositories/venue.repository.js';
import { CreateScreenDTO, CreateVenueDTO, Screen, Seat, Venue } from '../types/entities.js';
import { NotFoundError } from '../utils/errors.js';

export class VenueService {
  constructor(private repo: VenueRepository = venueRepository) {}

  async getAllVenues(): Promise<Venue[]> {
    return this.repo.findAll();
  }

  async getVenueById(id: string): Promise<{ venue: Venue; screens: Screen[] }> {
    const venue = await this.repo.findById(id);
    if (!venue) {
      throw new NotFoundError(`Venue with ID ${id} not found`);
    }
    const screens = await this.repo.findScreensByVenueId(id);
    return { venue, screens };
  }

  async createVenue(data: CreateVenueDTO): Promise<Venue> {
    return this.repo.create(data);
  }

  async createScreen(venueId: string, data: CreateScreenDTO): Promise<Screen> {
    const venue = await this.repo.findById(venueId);
    if (!venue) {
      throw new NotFoundError(`Venue with ID ${venueId} not found`);
    }
    return this.repo.createScreen(venueId, data);
  }

  async getScreenSeats(screenId: string): Promise<Seat[]> {
    const screen = await this.repo.findScreenById(screenId);
    if (!screen) {
      throw new NotFoundError(`Screen with ID ${screenId} not found`);
    }
    return this.repo.findSeatsByScreenId(screenId);
  }
}

export const venueService = new VenueService();

