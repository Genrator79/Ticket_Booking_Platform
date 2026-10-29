import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { env } from '../src/config/env';
import { bookingService } from '../src/services/booking.service';

describe('Concurrency & Double-Booking Prevention Integration Tests (M06)', () => {
  const app = createApp();

  let testShowId = '';
  let candidateSeats: { id: string; seat_label: string; price: number }[] = [];
  const generatedUserTokens: { id: string; token: string }[] = [];

  beforeAll(async () => {
    // 1. Generate 50 test users with valid JWT tokens for high-concurrency simulation
    for (let i = 1; i <= 50; i++) {
      const email = `concurrent_user_${i}@example.com`;
      await query('DELETE FROM users WHERE email = $1', [email]);
      const res = await query<{ id: string }>(
        `INSERT INTO users (name, email, password_hash, role)
         VALUES ($1, $2, 'dummyhash', 'customer') RETURNING id`,
        [`Concurrent User ${i}`, email]
      );
      const userId = res.rows[0].id;
      const token = jwt.sign(
        { userId, email, role: 'customer' },
        env.JWT_SECRET
      );
      generatedUserTokens.push({ id: userId, token });
    }

    // 2. Locate a show and fresh candidate seats
    const showRes = await query<{ id: string }>('SELECT id FROM shows LIMIT 1');
    testShowId = showRes.rows[0].id;

    // Reset some seats to AVAILABLE for this show
    const seatsRes = await query<{ id: string; seat_label: string; price: string }>(
      `SELECT ss.id, s.seat_label, ss.price
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1
       LIMIT 10`,
      [testShowId]
    );

    const seatIds = seatsRes.rows.map((s) => s.id);
    await query('DELETE FROM booking_seats WHERE show_seat_id = ANY($1)', [seatIds]);
    await query("UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id = ANY($1)", [seatIds]);

    candidateSeats = seatsRes.rows.map((s) => ({
      id: s.id,
      seat_label: s.seat_label,
      price: Number(s.price),
    }));
  });

  afterAll(async () => {
    const userIds = generatedUserTokens.map((u) => u.id);
    await query('DELETE FROM bookings WHERE user_id = ANY($1)', [userIds]);
    await query('DELETE FROM users WHERE id = ANY($1)', [userIds]);
    await closePool();
  });

  describe('1. Race Condition Demonstration (Without Pessimistic Locking)', () => {
    it('should demonstrate double-booking race condition when row-level locking is omitted', async () => {
      const targetSeatId = candidateSeats[0].id;
      // Ensure seat is fresh and AVAILABLE
      await query('DELETE FROM booking_seats WHERE show_seat_id = $1', [targetSeatId]);
      await query("UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id = $1", [targetSeatId]);

      const u1 = generatedUserTokens[0];
      const u2 = generatedUserTokens[1];

      // Fire two concurrent requests without row locking (with artificial race window)
      const results = await Promise.allSettled([
        bookingService.createBookingWithoutLocking(u1.id, {
          show_id: testShowId,
          show_seat_ids: [targetSeatId],
        }),
        bookingService.createBookingWithoutLocking(u2.id, {
          show_id: testShowId,
          show_seat_ids: [targetSeatId],
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');

      // Check database: Both transactions committed, resulting in 2 bookings for the SAME seat!
      const duplicateCheck = await query(
        'SELECT booking_id, show_seat_id FROM booking_seats WHERE show_seat_id = $1',
        [targetSeatId]
      );

      // Verify that the race condition produced a double booking
      expect(fulfilled.length).toBe(2);
      expect(duplicateCheck.rows.length).toBe(2);

      // Clean up the intentional double-booking fixture
      await query('DELETE FROM booking_seats WHERE show_seat_id = $1', [targetSeatId]);
      await query("UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id = $1", [targetSeatId]);
    });
  });

  describe('2. Protected High-Concurrency Stress Test (50 Competing Requests for 1 Seat)', () => {
    it('enforces exactly ONE winner, 49 conflict rejections, and ZERO double-bookings', async () => {
      const contentionSeat = candidateSeats[1];
      const targetSeatId = contentionSeat.id;

      // Ensure seat is fresh and AVAILABLE
      await query("UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id = $1", [targetSeatId]);

      // Launch 50 simultaneous competing HTTP requests for the exact same seat
      const requestPromises = generatedUserTokens.map((user) =>
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${user.token}`)
          .send({
            show_id: testShowId,
            show_seat_ids: [targetSeatId],
          })
      );

      const responses = await Promise.all(requestPromises);

      // Classify HTTP outcomes
      const winners = responses.filter((r) => r.status === 201);
      const conflicts = responses.filter((r) => r.status === 409);
      const errors = responses.filter((r) => r.status !== 201 && r.status !== 409);

      // Strict assertions:
      // 1. Zero unexpected errors (no unhandled 500s or timeouts)
      expect(errors.length).toBe(0);

      // 2. Exactly 1 winner
      expect(winners.length).toBe(1);
      expect(winners[0].body.success).toBe(true);
      expect(winners[0].body.data.seats[0].show_seat_id).toBe(targetSeatId);

      // 3. Exactly 49 conflicts
      expect(conflicts.length).toBe(49);
      conflicts.forEach((c) => {
        expect(c.body.success).toBe(false);
        expect(c.body.message).toMatch(/no longer available/i);
      });

      // 4. Database Verification: Exactly 1 booking record linked to this seat
      const dbBookings = await query(
        'SELECT booking_id FROM booking_seats WHERE show_seat_id = $1',
        [targetSeatId]
      );
      expect(dbBookings.rows.length).toBe(1);

      // 5. Seat status in database must be BOOKED and version incremented
      const seatDb = await query<{ status: string; version: number }>(
        'SELECT status, version FROM show_seats WHERE id = $1',
        [targetSeatId]
      );
      expect(seatDb.rows[0].status).toBe('BOOKED');
      expect(seatDb.rows[0].version).toBe(2);
    });
  });

  describe('3. Multi-Seat Contention & Deadlock Prevention', () => {
    it('should eliminate circular wait deadlocks when competing requests order seat IDs deterministically', async () => {
      const seatA = candidateSeats[2];
      const seatB = candidateSeats[3];

      // Ensure both seats are AVAILABLE
      await query(
        "UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id IN ($1, $2)",
        [seatA.id, seatB.id]
      );

      // Client 1 requests [seatA, seatB] while Client 2 requests [seatB, seatA] in reverse order
      const client1 = generatedUserTokens[2];
      const client2 = generatedUserTokens[3];

      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${client1.token}`)
          .send({
            show_id: testShowId,
            show_seat_ids: [seatA.id, seatB.id],
          }),
        request(app)
          .post('/api/bookings')
          .set('Authorization', `Bearer ${client2.token}`)
          .send({
            show_id: testShowId,
            show_seat_ids: [seatB.id, seatA.id], // Reverse order in client payload
          }),
      ]);

      // One must succeed with 201, the other must fail with 409
      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Neither request should encounter a deadlock error (PostgreSQL 40P01)
      expect(res1.body.message).not.toMatch(/deadlock/i);
      expect(res2.body.message).not.toMatch(/deadlock/i);

      // Verify database: exactly 2 booking_seats rows exist (one for seatA, one for seatB) under same booking
      const bookedSeats = await query(
        'SELECT booking_id, show_seat_id FROM booking_seats WHERE show_seat_id IN ($1, $2)',
        [seatA.id, seatB.id]
      );
      expect(bookedSeats.rows.length).toBe(2);
      expect(bookedSeats.rows[0].booking_id).toBe(bookedSeats.rows[1].booking_id);
    });

    it('should rollback transaction completely if one of the requested seats is unavailable', async () => {
      const seatAvailable = candidateSeats[4];
      const seatBooked = candidateSeats[1]; // Already BOOKED in previous test

      await query(
        "UPDATE show_seats SET status = 'AVAILABLE', version = 1 WHERE id = $1",
        [seatAvailable.id]
      );

      const client = generatedUserTokens[4];

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${client.token}`)
        .send({
          show_id: testShowId,
          show_seat_ids: [seatAvailable.id, seatBooked.id],
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);

      // Verify atomic rollback: the available seat was NOT marked BOOKED
      const seatCheck = await query<{ status: string }>(
        'SELECT status FROM show_seats WHERE id = $1',
        [seatAvailable.id]
      );
      expect(seatCheck.rows[0].status).toBe('AVAILABLE');
    });
  });
});
