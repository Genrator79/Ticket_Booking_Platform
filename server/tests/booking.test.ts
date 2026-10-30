import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { closeRedis } from '../src/redis/index';
import { env } from '../src/config/env';

describe('Basic Booking Flow Integration Tests (M05)', () => {
  const app = createApp();

  let testUser1 = { id: '', email: 'booker1@example.com', token: '' };
  let testUser2 = { id: '', email: 'booker2@example.com', token: '' };
  let testShowId = '';
  let availableShowSeats: { id: string; price: number; seat_label: string }[] = [];

  beforeAll(async () => {
    // 1. Create two test users
    await query('DELETE FROM users WHERE email IN ($1, $2)', [testUser1.email, testUser2.email]);

    const u1 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Booker One', $1, 'hashed', 'customer') RETURNING id`,
      [testUser1.email]
    );
    testUser1.id = u1.rows[0].id;
    testUser1.token = jwt.sign(
      { userId: testUser1.id, email: testUser1.email, role: 'customer' },
      env.JWT_SECRET
    );

    const u2 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Booker Two', $1, 'hashed', 'customer') RETURNING id`,
      [testUser2.email]
    );
    testUser2.id = u2.rows[0].id;
    testUser2.token = jwt.sign(
      { userId: testUser2.id, email: testUser2.email, role: 'customer' },
      env.JWT_SECRET
    );

    // 2. Find a show and its available seats
    const showRes = await query<{ id: string }>('SELECT id FROM shows LIMIT 1');
    testShowId = showRes.rows[0].id;

    const seatsRes = await query<{ id: string; price: string; seat_label: string }>(
      `SELECT ss.id, ss.price, s.seat_label 
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1 AND ss.status = 'AVAILABLE'
       LIMIT 5`,
      [testShowId]
    );
    availableShowSeats = seatsRes.rows.map((r) => ({
      id: r.id,
      price: Number(r.price),
      seat_label: r.seat_label,
    }));
  });

  afterAll(async () => {
    // Clean up created bookings for test users
    await query('DELETE FROM bookings WHERE user_id IN ($1, $2)', [testUser1.id, testUser2.id]);
    await query('DELETE FROM users WHERE id IN ($1, $2)', [testUser1.id, testUser2.id]);
    await closePool();
    await closeRedis();
  });

  describe('POST /api/bookings', () => {
    let createdBookingId = '';

    it('should successfully book available seats and update database state to BOOKED', async () => {
      const seatsToBook = [availableShowSeats[0].id, availableShowSeats[1].id];
      const expectedTotal = availableShowSeats[0].price + availableShowSeats[1].price;

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser1.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: seatsToBook,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Booking confirmed successfully');
      expect(res.body.data).toBeDefined();

      const booking = res.body.data;
      createdBookingId = booking.id;
      expect(booking.user_id).toBe(testUser1.id);
      expect(booking.show_id).toBe(testShowId);
      expect(booking.status).toBe('CONFIRMED');
      expect(Number(booking.total_amount)).toBe(expectedTotal);
      expect(booking.seats.length).toBe(2);

      // Verify DB show_seats updated to BOOKED
      const dbSeats = await query<{ status: string }>(
        'SELECT status FROM show_seats WHERE id = ANY($1)',
        [seatsToBook]
      );
      dbSeats.rows.forEach((s) => {
        expect(s.status).toBe('BOOKED');
      });

      // Verify booking_seats table records
      const dbBookingSeats = await query<{ price: string }>(
        'SELECT price FROM booking_seats WHERE booking_id = $1',
        [createdBookingId]
      );
      expect(dbBookingSeats.rows.length).toBe(2);
    });

    it('should reject booking already booked seats with 409 Conflict', async () => {
      // Attempt to book the exact same seat that was just booked
      const alreadyBookedSeat = [availableShowSeats[0].id];

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser2.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: alreadyBookedSeat,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/no longer available/i);
    });

    it('should reject booking without authentication token (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .send({
          show_id: testShowId,
          show_seat_ids: [availableShowSeats[2].id],
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject booking with duplicate seat IDs in payload (400 Bad Request)', async () => {
      const seatId = availableShowSeats[2].id;
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser1.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: [seatId, seatId],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/duplicate/i);
    });

    it('should reject booking with empty seat array (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser1.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/bookings and GET /api/bookings/:id (Authorization)', () => {
    let bookingId = '';

    beforeAll(async () => {
      // Book seat 3 for testUser1
      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser1.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: [availableShowSeats[2].id],
        });
      bookingId = res.body.data.id;
    });

    it('GET /api/bookings should list only authenticated user bookings', async () => {
      const res = await request(app)
        .get('/api/bookings')
        .set('Authorization', `Bearer ${testUser1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach((b: any) => {
        expect(b.user_id).toBe(testUser1.id);
      });
    });

    it('GET /api/bookings/:id should allow owner to view booking confirmation', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${testUser1.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(bookingId);
      expect(res.body.data.movie_title).toBeDefined();
      expect(res.body.data.venue_name).toBeDefined();
      expect(res.body.data.screen_name).toBeDefined();
      expect(Array.isArray(res.body.data.seats)).toBe(true);
    });

    it('GET /api/bookings/:id should deny other customers with 403 Forbidden', async () => {
      const res = await request(app)
        .get(`/api/bookings/${bookingId}`)
        .set('Authorization', `Bearer ${testUser2.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/permission/i);
    });
  });
});

