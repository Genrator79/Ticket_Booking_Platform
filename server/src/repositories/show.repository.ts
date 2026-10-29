import { query, withTransaction } from '../db/index.js';
import { CreateShowDTO, Show, ShowSeatWithLayout, ShowWithDetails } from '../types/entities.js';

export class ShowRepository {
  async findAll(filters?: { movieId?: string; date?: string }): Promise<ShowWithDetails[]> {
    let sql = `
      SELECT 
        s.id, s.movie_id, s.screen_id, s.start_time, s.end_time, s.base_price, s.created_at, s.updated_at,
        m.title AS movie_title, m.poster_url AS movie_poster_url, m.genre AS movie_genre, m.duration_minutes AS movie_duration,
        v.id AS venue_id, v.name AS venue_name, v.city AS venue_city,
        sc.name AS screen_name
      FROM shows s
      JOIN movies m ON s.movie_id = m.id
      JOIN screens sc ON s.screen_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters?.movieId) {
      params.push(filters.movieId);
      sql += ` AND s.movie_id = $${params.length}`;
    }

    if (filters?.date) {
      params.push(filters.date);
      sql += ` AND DATE(s.start_time) = DATE($${params.length})`;
    }

    sql += ' ORDER BY s.start_time ASC';
    const result = await query<ShowWithDetails>(sql, params);
    return result.rows;
  }

  async findById(id: string): Promise<ShowWithDetails | null> {
    const sql = `
      SELECT 
        s.id, s.movie_id, s.screen_id, s.start_time, s.end_time, s.base_price, s.created_at, s.updated_at,
        m.title AS movie_title, m.poster_url AS movie_poster_url, m.genre AS movie_genre, m.duration_minutes AS movie_duration,
        v.id AS venue_id, v.name AS venue_name, v.city AS venue_city,
        sc.name AS screen_name
      FROM shows s
      JOIN movies m ON s.movie_id = m.id
      JOIN screens sc ON s.screen_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE s.id = $1
      LIMIT 1
    `;
    const result = await query<ShowWithDetails>(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Creates a new show inside a database transaction.
   * Crucially, automatically generates show_seats records for each physical seat in the screen.
   */
  async create(data: CreateShowDTO): Promise<Show> {
    return withTransaction(async (client) => {
      // 1. Insert show
      const insertShowSql = `
        INSERT INTO shows (movie_id, screen_id, start_time, end_time, base_price)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const showRes = await client.query<Show>(insertShowSql, [
        data.movie_id,
        data.screen_id,
        data.start_time,
        data.end_time,
        data.base_price,
      ]);
      const show = showRes.rows[0];

      // 2. Fetch screen physical seats
      const seatsSql = 'SELECT id, tier FROM seats WHERE screen_id = $1';
      const seatsRes = await client.query<{ id: string; tier: string }>(seatsSql, [data.screen_id]);

      // 3. Populate show_seats with tier-adjusted pricing
      for (const seat of seatsRes.rows) {
        let price = Number(data.base_price);
        if (seat.tier === 'PREMIUM') price += 5;
        if (seat.tier === 'VIP') price += 10;

        await client.query(
          `INSERT INTO show_seats (show_id, seat_id, status, price)
           VALUES ($1, $2, 'AVAILABLE', $3)`,
          [show.id, seat.id, price]
        );
      }

      return show;
    });
  }

  /**
   * Retrieves all show_seats with physical seat layout information.
   * High-concurrency query used by GET /api/shows/:showId/seats.
   */
  async getShowSeats(showId: string): Promise<ShowSeatWithLayout[]> {
    const sql = `
      SELECT 
        ss.id,
        ss.show_id,
        ss.seat_id,
        ss.status,
        ss.price,
        ss.version,
        ss.updated_at,
        s.row,
        s.number,
        s.seat_label,
        s.tier
      FROM show_seats ss
      JOIN seats s ON ss.seat_id = s.id
      WHERE ss.show_id = $1
      ORDER BY s.row ASC, s.number ASC
    `;
    const result = await query<ShowSeatWithLayout>(sql, [showId]);
    return result.rows;
  }
}

export const showRepository = new ShowRepository();

