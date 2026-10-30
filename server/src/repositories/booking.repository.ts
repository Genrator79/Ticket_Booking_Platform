import pg from 'pg';
import { query } from '../db/index.js';
import { Booking, BookingSeatDetail, BookingWithDetails } from '../types/booking.js';

export interface ShowSeatLookup {
  id: string;
  show_id: string;
  seat_id: string;
  status: 'AVAILABLE' | 'HELD' | 'BOOKED';
  price: string | number;
  seat_label: string;
  row: string;
  number: number;
  tier: string;
}

export class BookingRepository {
  /**
   * Retrieves show_seat records by IDs along with their physical seat coordinates.
   * Can accept a transactional client or use the global pool.
   */
  async getShowSeatsByIds(
    showSeatIds: string[],
    client?: pg.PoolClient
  ): Promise<ShowSeatLookup[]> {
    const sql = `
      SELECT 
        ss.id,
        ss.show_id,
        ss.seat_id,
        ss.status,
        ss.price,
        s.seat_label,
        s.row,
        s.number,
        s.tier
      FROM show_seats ss
      JOIN seats s ON ss.seat_id = s.id
      WHERE ss.id = ANY($1)
    `;
    const result = client
      ? await client.query<ShowSeatLookup>(sql, [showSeatIds])
      : await query<ShowSeatLookup>(sql, [showSeatIds]);
    return result.rows;
  }

  /**
   * Retrieves and locks requested show_seats rows using pessimistic row-level locking (SELECT ... FOR UPDATE).
   * 
   * Concurrency & Deadlock Prevention:
   * 1. `ORDER BY ss.id ASC`: Deterministic UUID sorting guarantees that concurrent transactions
   *    always request locks in identical order, eliminating circular wait deadlocks (PostgreSQL 40P01).
   * 2. `FOR UPDATE OF ss`: Acquires exclusive row locks on show_seats. Competing transactions
   *    vying for the same seat will block until the lock holder commits or rolls back.
   */
  async getShowSeatsForUpdate(
    client: pg.PoolClient,
    showSeatIds: string[]
  ): Promise<ShowSeatLookup[]> {
    const sortedIds = [...showSeatIds].sort();

    const sql = `
      SELECT 
        ss.id,
        ss.show_id,
        ss.seat_id,
        ss.status,
        ss.price,
        s.seat_label,
        s.row,
        s.number,
        s.tier
      FROM show_seats ss
      JOIN seats s ON ss.seat_id = s.id
      WHERE ss.id = ANY($1)
      ORDER BY ss.id ASC
      FOR UPDATE OF ss
    `;
    const result = await client.query<ShowSeatLookup>(sql, [sortedIds]);
    return result.rows;
  }

  /**
   * Inserts the master booking record.
   */
  async createBookingRecord(
    client: pg.PoolClient,
    data: {
      user_id: string;
      show_id: string;
      total_amount: number;
      status?: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED';
    }
  ): Promise<Booking> {
    const sql = `
      INSERT INTO bookings (user_id, show_id, total_amount, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const status = data.status || 'CONFIRMED';
    const result = await client.query<Booking>(sql, [
      data.user_id,
      data.show_id,
      data.total_amount,
      status,
    ]);
    return result.rows[0];
  }

  /**
   * Updates booking status (e.g. PENDING -> CONFIRMED, FAILED, or CANCELLED)
   */
  async updateBookingStatus(
    bookingId: string,
    status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'CANCELLED' | 'EXPIRED',
    client?: pg.PoolClient
  ): Promise<Booking | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      UPDATE bookings
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const res = await runner<Booking>(sql, [status, bookingId]);
    return res.rows[0] || null;
  }

  /**
   * Inserts itemized booking_seats records.
   */
  async createBookingSeats(
    client: pg.PoolClient,
    bookingId: string,
    seatItems: { show_seat_id: string; price: number }[]
  ): Promise<void> {
    for (const item of seatItems) {
      await client.query(
        `INSERT INTO booking_seats (booking_id, show_seat_id, price)
         VALUES ($1, $2, $3)`,
        [bookingId, item.show_seat_id, item.price]
      );
    }
  }

  /**
   * Updates status of show_seats with optimistic version increment.
   * Optionally verifies expected current status as defense-in-depth against stale writes.
   */
  async updateShowSeatsStatus(
    client: pg.PoolClient,
    showSeatIds: string[],
    newStatus: 'AVAILABLE' | 'HELD' | 'BOOKED',
    expectedCurrentStatus?: 'AVAILABLE' | 'HELD'
  ): Promise<number> {
    let sql = `
      UPDATE show_seats 
      SET status = $1, version = version + 1, updated_at = NOW()
      WHERE id = ANY($2)
    `;
    const params: any[] = [newStatus, showSeatIds];

    if (expectedCurrentStatus) {
      params.push(expectedCurrentStatus);
      sql += ` AND status = $${params.length}`;
    }

    const result = await client.query(sql, params);
    return result.rowCount ?? 0;
  }

  /**
   * Retrieves full details for a booking by its primary key.
   */
  async findById(bookingId: string): Promise<BookingWithDetails | null> {
    const sql = `
      SELECT 
        b.id, b.user_id, b.show_id, b.status, b.total_amount, b.idempotency_key, b.created_at, b.updated_at,
        m.title AS movie_title, m.poster_url AS movie_poster_url,
        v.name AS venue_name, v.city AS venue_city,
        sc.name AS screen_name,
        s.start_time, s.end_time
      FROM bookings b
      JOIN shows s ON b.show_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN screens sc ON s.screen_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE b.id = $1
      LIMIT 1
    `;
    const result = await query<any>(sql, [bookingId]);
    if (result.rows.length === 0) return null;

    const base = result.rows[0];
    const seats = await this.getBookingSeatsDetails(bookingId);

    return {
      ...base,
      seats,
    };
  }

  /**
   * Retrieves all bookings made by a specific user.
   */
  async findByUserId(userId: string): Promise<BookingWithDetails[]> {
    const sql = `
      SELECT 
        b.id, b.user_id, b.show_id, b.status, b.total_amount, b.idempotency_key, b.created_at, b.updated_at,
        m.title AS movie_title, m.poster_url AS movie_poster_url,
        v.name AS venue_name, v.city AS venue_city,
        sc.name AS screen_name,
        s.start_time, s.end_time
      FROM bookings b
      JOIN shows s ON b.show_id = s.id
      JOIN movies m ON s.movie_id = m.id
      JOIN screens sc ON s.screen_id = sc.id
      JOIN venues v ON sc.venue_id = v.id
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `;
    const result = await query<any>(sql, [userId]);
    const bookings: BookingWithDetails[] = [];

    for (const row of result.rows) {
      const seats = await this.getBookingSeatsDetails(row.id);
      bookings.push({
        ...row,
        seats,
      });
    }

    return bookings;
  }

  /**
   * Helper to retrieve seat coordinates for a booking.
   */
  private async getBookingSeatsDetails(bookingId: string): Promise<BookingSeatDetail[]> {
    const sql = `
      SELECT 
        bs.id,
        bs.show_seat_id,
        bs.price,
        s.seat_label,
        s.row,
        s.number,
        s.tier
      FROM booking_seats bs
      JOIN show_seats ss ON bs.show_seat_id = ss.id
      JOIN seats s ON ss.seat_id = s.id
      WHERE bs.booking_id = $1
      ORDER BY s.row ASC, s.number ASC
    `;
    const result = await query<any>(sql, [bookingId]);
    return result.rows.map((r) => ({
      id: r.id,
      show_seat_id: r.show_seat_id,
      seat_label: r.seat_label,
      row: r.row,
      number: r.number,
      tier: r.tier,
      price: Number(r.price),
    }));
  }
}

export const bookingRepository = new BookingRepository();
