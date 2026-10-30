import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { closeRedis } from '../src/redis/index';
import { redisService } from '../src/redis/redis.service';
import { env } from '../src/config/env';

describe('M08 — Temporary Seat Holds Integration Tests', () => {
  const app = createApp();

  let user1 = { id: '', email: 'holder1@example.com', token: '' };
  let user2 = { id: '', email: 'holder2@example.com', token: '' };
  let testShowId = '';
  let availableShowSeats: { id: string; price: number; seat_label: string }[] = [];

  beforeAll(async () => {
    // 1. Clean up existing test data
    await query(
      `DELETE FROM booking_seats 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2)))`,
      [user1.email, user2.email]
    );
    await query(
      `DELETE FROM bookings 
       WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2))`,
      [user1.email, user2.email]
    );
    await query('DELETE FROM users WHERE email IN ($1, $2)', [user1.email, user2.email]);

    const u1 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Holder One', $1, 'hash1', 'customer') RETURNING id`,
      [user1.email]
    );
    user1.id = u1.rows[0].id;
    user1.token = jwt.sign(
      { userId: user1.id, email: user1.email, role: 'customer' },
      env.JWT_SECRET
    );

    const u2 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Holder Two', $1, 'hash2', 'customer') RETURNING id`,
      [user2.email]
    );
    user2.id = u2.rows[0].id;
    user2.token = jwt.sign(
      { userId: user2.id, email: user2.email, role: 'customer' },
      env.JWT_SECRET
    );

    // 2. Locate a show and reset 10 seats to AVAILABLE
    const showRes = await query<{ id: string }>('SELECT id FROM shows LIMIT 1');
    testShowId = showRes.rows[0].id;

    const seatsRes = await query<{ id: string; price: string; seat_label: string }>(
      `SELECT ss.id, ss.price, s.seat_label 
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1
       LIMIT 10`,
      [testShowId]
    );

    availableShowSeats = seatsRes.rows.map((r) => ({
      id: r.id,
      price: Number(r.price),
      seat_label: r.seat_label,
    }));

    const seatIds = availableShowSeats.map((s) => s.id);
    await query('DELETE FROM booking_seats WHERE show_seat_id = ANY($1)', [seatIds]);
    await query("UPDATE show_seats SET status = 'AVAILABLE' WHERE id = ANY($1)", [seatIds]);
  });

  beforeEach(async () => {
    // Clean all hold keys from Redis before each test
    const keys = await redisService.keys('seat_hold:*');
    const holdKeys = await redisService.keys('hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }
  });

  afterAll(async () => {
    // Clean all holds and reset database state
    const keys = await redisService.keys('seat_hold:*');
    const holdKeys = await redisService.keys('hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }

    const seatIds = availableShowSeats.map((s) => s.id);
    await query('DELETE FROM booking_seats WHERE show_seat_id = ANY($1)', [seatIds]);
    if (user1.id && user2.id) {
      await query('DELETE FROM bookings WHERE user_id IN ($1, $2)', [user1.id, user2.id]);
    }
    await query("UPDATE show_seats SET status = 'AVAILABLE' WHERE id = ANY($1)", [seatIds]);
    await query('DELETE FROM users WHERE email IN ($1, $2)', [user1.email, user2.email]);

    await closePool();
    await closeRedis();
  });

  it('POST /api/holds should place a temporary hold on seats with TTL', async () => {
    const requestedSeats = [availableShowSeats[0].id, availableShowSeats[1].id];

    const res = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: requestedSeats,
        ttl_seconds: 60,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const hold = res.body.data;
    expect(hold.holdId).toBeDefined();
    expect(hold.showId).toBe(testShowId);
    expect(hold.showSeatIds).toEqual(requestedSeats);
    expect(hold.seatLabels).toHaveLength(2);
    expect(hold.totalAmount).toBe(availableShowSeats[0].price + availableShowSeats[1].price);
    expect(hold.expiresInSeconds).toBe(60);
    expect(new Date(hold.expiresAt).getTime()).toBeGreaterThan(Date.now());

    // Verify Redis seat keys exist
    const key1 = `seat_hold:${testShowId}:${requestedSeats[0]}`;
    const key2 = `seat_hold:${testShowId}:${requestedSeats[1]}`;
    expect(await redisService.exists(key1)).toBe(true);
    expect(await redisService.exists(key2)).toBe(true);

    const ttl = await redisService.ttl(key1);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('POST /api/holds should return 409 Conflict when another user attempts to hold the same seat', async () => {
    const targetSeat = availableShowSeats[2].id;

    // User 1 successfully holds seat
    const holdRes1 = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });
    expect(holdRes1.status).toBe(201);

    // User 2 attempts to hold the identical seat
    const holdRes2 = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });

    expect(holdRes2.status).toBe(409);
    expect(holdRes2.body.success).toBe(false);
    expect(holdRes2.body.message).toContain('currently held');
  });

  it('POST /api/holds should enforce all-or-nothing atomicity for multi-seat holds', async () => {
    const seatA = availableShowSeats[3].id;
    const seatB = availableShowSeats[4].id;

    // User 1 holds seat A
    await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatA],
      });

    // User 2 attempts to hold both [seatA, seatB]
    const res = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatA, seatB],
      });

    expect(res.status).toBe(409);

    // Atomicity assertion: Seat B must NOT have been locked/held!
    const seatBKey = `seat_hold:${testShowId}:${seatB}`;
    expect(await redisService.exists(seatBKey)).toBe(false);

    // User 1 (or any other user) should still be able to hold seat B freely
    const holdBRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatB],
      });
    expect(holdBRes.status).toBe(201);
  });

  it('GET /api/shows/:showId/seats should overlay active Redis holds as HELD', async () => {
    const targetSeat = availableShowSeats[5];

    // Verify seat is initially AVAILABLE
    const initialSeatsRes = await request(app).get(`/api/shows/${testShowId}/seats`);
    const initialSeat = initialSeatsRes.body.data.seats.find((s: any) => s.id === targetSeat.id);
    expect(initialSeat.status).toBe('AVAILABLE');

    // Place temporary hold
    await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat.id],
      });

    // Retrieve layout again — status must now be HELD
    const heldSeatsRes = await request(app).get(`/api/shows/${testShowId}/seats`);
    const heldSeat = heldSeatsRes.body.data.seats.find((s: any) => s.id === targetSeat.id);
    expect(heldSeat.status).toBe('HELD');
  });

  it('GET /api/holds/:id should retrieve active hold details with authorization check', async () => {
    const targetSeat = availableShowSeats[6].id;

    const createRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });
    const holdId = createRes.body.data.holdId;

    // Owner (user1) can view hold
    const getRes = await request(app)
      .get(`/api/holds/${holdId}`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.holdId).toBe(holdId);
    expect(getRes.body.data.expiresInSeconds).toBeGreaterThan(0);

    // Non-owner (user2) receives 403 Forbidden
    const forbiddenRes = await request(app)
      .get(`/api/holds/${holdId}`)
      .set('Authorization', `Bearer ${user2.token}`);

    expect(forbiddenRes.status).toBe(403);
  });

  it('DELETE /api/holds/:id should immediately release held seats', async () => {
    const targetSeat = availableShowSeats[7].id;

    const createRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });
    const holdId = createRes.body.data.holdId;

    // Release hold
    const deleteRes = await request(app)
      .delete(`/api/holds/${holdId}`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toContain('released');

    // Seat key must be gone in Redis
    const key = `seat_hold:${testShowId}:${targetSeat}`;
    expect(await redisService.exists(key)).toBe(false);

    // User 2 can now immediately acquire the seat
    const reHoldRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });

    expect(reHoldRes.status).toBe(201);
  });

  it('POST /api/bookings should prevent direct booking of seats currently held in Redis', async () => {
    const targetSeat = availableShowSeats[8].id;

    // User 1 holds the seat
    await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });

    // User 2 attempts direct booking without hold
    const directBookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });

    expect(directBookingRes.status).toBe(409);
    expect(directBookingRes.body.message).toContain('held');
  });

  it('POST /api/bookings with hold_id should successfully confirm booking and release hold keys', async () => {
    const targetSeat = availableShowSeats[9].id;

    // 1. User 1 acquires temporary hold
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [targetSeat],
      });
    const holdId = holdRes.body.data.holdId;

    // 2. User 1 confirms booking via hold_id
    const bookRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        hold_id: holdId,
      });

    expect(bookRes.status).toBe(201);
    expect(bookRes.body.success).toBe(true);
    expect(bookRes.body.data.status).toBe('CONFIRMED');

    // 3. Verify Redis seat hold keys were cleanly released
    const key = `seat_hold:${testShowId}:${targetSeat}`;
    expect(await redisService.exists(key)).toBe(false);
    expect(await redisService.exists(`hold:${holdId}`)).toBe(false);

    // 4. Verify PostgreSQL permanent status is BOOKED
    const dbSeat = await query<{ status: string }>('SELECT status FROM show_seats WHERE id = $1', [targetSeat]);
    expect(dbSeat.rows[0].status).toBe('BOOKED');
  });

  it('Concurrent hold stress test: 25 simultaneous users attempting to hold 1 seat', async () => {
    // Pick an available seat
    const [freshSeat] = availableShowSeats;
    await query("UPDATE show_seats SET status = 'AVAILABLE' WHERE id = $1", [freshSeat.id]);
    await query('DELETE FROM booking_seats WHERE show_seat_id = $1', [freshSeat.id]);

    const concurrentUsers = Array.from({ length: 25 }, (_, i) => ({
      token: jwt.sign(
        { userId: `00000000-0000-0000-0000-0000000000${(i + 10).toString(16)}`, email: `stress${i}@test.com`, role: 'customer' },
        env.JWT_SECRET
      ),
    }));

    // Fire 25 simultaneous hold requests for the single seat
    const responses = await Promise.all(
      concurrentUsers.map((u) =>
        request(app)
          .post('/api/holds')
          .set('Authorization', `Bearer ${u.token}`)
          .send({
            show_id: testShowId,
            show_seat_ids: [freshSeat.id],
            ttl_seconds: 30,
          })
      )
    );

    const winners = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(winners).toHaveLength(1);
    expect(conflicts).toHaveLength(24);

    // Verify Redis holds exactly 1 lock for this seat
    const seatKey = `seat_hold:${testShowId}:${freshSeat.id}`;
    expect(await redisService.exists(seatKey)).toBe(true);
  });
});
