import { query } from '../db/index.js';
import { CreateScreenDTO, CreateVenueDTO, Screen, Seat, Venue } from '../types/entities.js';

export class VenueRepository {
  async findAll(): Promise<Venue[]> {
    const sql = 'SELECT * FROM venues ORDER BY name ASC';
    const result = await query<Venue>(sql);
    return result.rows;
  }

  async findById(id: string): Promise<Venue | null> {
    const sql = 'SELECT * FROM venues WHERE id = $1 LIMIT 1';
    const result = await query<Venue>(sql, [id]);
    return result.rows[0] || null;
  }

  async create(data: CreateVenueDTO): Promise<Venue> {
    const sql = `
      INSERT INTO venues (name, city, address)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await query<Venue>(sql, [data.name, data.city, data.address]);
    return result.rows[0];
  }

  async findScreensByVenueId(venueId: string): Promise<Screen[]> {
    const sql = 'SELECT * FROM screens WHERE venue_id = $1 ORDER BY name ASC';
    const result = await query<Screen>(sql, [venueId]);
    return result.rows;
  }

  async findScreenById(screenId: string): Promise<Screen | null> {
    const sql = 'SELECT * FROM screens WHERE id = $1 LIMIT 1';
    const result = await query<Screen>(sql, [screenId]);
    return result.rows[0] || null;
  }

  async createScreen(venueId: string, data: CreateScreenDTO): Promise<Screen> {
    const sql = `
      INSERT INTO screens (venue_id, name, total_seats)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await query<Screen>(sql, [venueId, data.name, data.total_seats || 0]);
    return result.rows[0];
  }

  async findSeatsByScreenId(screenId: string): Promise<Seat[]> {
    const sql = 'SELECT * FROM seats WHERE screen_id = $1 ORDER BY row ASC, number ASC';
    const result = await query<Seat>(sql, [screenId]);
    return result.rows;
  }
}

export const venueRepository = new VenueRepository();

