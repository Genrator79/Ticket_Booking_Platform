import request from 'supertest';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { closeRedis } from '../src/redis/index';
import { redisService } from '../src/redis/redis.service';
import { env } from '../src/config/env';

describe('M10 — Idempotency Integration Tests', () => {
  const app = createApp();

  let testUser = { id: '', email: 'idemp_user@example.com', token: '' };
  let testShowId = '';
  let availableShowSeats: { id: string; price: number; seat_label: string }[] = [];

  beforeAll(async () => {
    // 1. Clean up existing test data
    await query(
      `DELETE FROM payments 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [testUser.email]
    );
    await query(
      `DELETE FROM booking_seats 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [testUser.email]
    );
    await query(
      `DELETE FROM bookings 
       WHERE user_id IN (SELECT id FROM users WHERE email = $1)`,
      [testUser.email]
    );
    await query('DELETE FROM idempotency_keys WHERE user_id IN (SELECT id FROM users WHERE email = $1)', [testUser.email]);
    await query('DELETE FROM users WHERE email = $1', [testUser.email]);

    // 2. Create test user
    const u = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Idempotency Tester', $1, 'hashed', 'customer') RETURNING id`,
      [testUser.email]
    );
    testUser.id = u.rows[0].id;
    testUser.token = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: 'customer' },
      env.JWT_SECRET
    );

    // 3. Locate show and reset seats
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
    const keys = await redisService.keys('idemp:*');
    const holdKeys = await redisService.keys('seat_hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }
  });

  afterAll(async () => {
    const keys = await redisService.keys('idemp:*');
    const holdKeys = await redisService.keys('seat_hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }

    const seatIds = availableShowSeats.map((s) => s.id);
    await query(
      `DELETE FROM payments 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = $1)`,
      [testUser.id]
    );
    await query('DELETE FROM booking_seats WHERE show_seat_id = ANY($1)', [seatIds]);
    await query('DELETE FROM bookings WHERE user_id = $1', [testUser.id]);
    await query('DELETE FROM idempotency_keys WHERE user_id = $1', [testUser.id]);
    await query("UPDATE show_seats SET status = 'AVAILABLE' WHERE id = ANY($1)", [seatIds]);
    await query('DELETE FROM users WHERE email = $1', [testUser.email]);

    await closePool();
    await closeRedis();
  });

  it('should replay cached response when repeating request with the same Idempotency-Key', async () => {
    const seatId = availableShowSeats[0].id;
    const idempotencyKey = `idem_${crypto.randomUUID()}`;

    const payload = {
      show_id: testShowId,
      show_seat_ids: [seatId],
    };

    // 1. Initial request
    const firstRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(firstRes.status).toBe(201);
    expect(firstRes.body.success).toBe(true);
    expect(firstRes.headers['idempotent-replayed']).toBeUndefined();
    const createdBookingId = firstRes.body.data.id;

    // 2. Duplicate retry request with identical key and payload
    const secondRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(secondRes.status).toBe(201);
    expect(secondRes.body.success).toBe(true);
    expect(secondRes.headers['idempotent-replayed']).toBe('true');
    expect(secondRes.body.data.id).toBe(createdBookingId);

    // 3. Database verification: exactly 1 booking record exists
    const countRes = await query<{ count: string }>(
      'SELECT COUNT(*) FROM bookings WHERE user_id = $1 AND idempotency_key = $2',
      [testUser.id, idempotencyKey]
    );
    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
  });

  it('should reject request with 422 Unprocessable Entity if Idempotency-Key is reused with altered payload', async () => {
    const seatA = availableShowSeats[1].id;
    const seatB = availableShowSeats[2].id;
    const idempotencyKey = `idem_tamper_${crypto.randomUUID()}`;

    // 1. First request with seatA
    const firstRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatA],
      });

    expect(firstRes.status).toBe(201);

    // 2. Reused key with altered payload (seatB instead of seatA)
    const tamperedRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatB],
      });

    expect(tamperedRes.status).toBe(422);
    expect(tamperedRes.body.success).toBe(false);
    expect(tamperedRes.body.message).toMatch(/different request payload/i);
  });

  it('should block simultaneous in-flight requests with identical key (409 Conflict)', async () => {
    const seatId = availableShowSeats[3].id;
    const idempotencyKey = `idem_concurrent_${crypto.randomUUID()}`;

    const payload = {
      show_id: testShowId,
      show_seat_ids: [seatId],
    };

    // Fire 2 simultaneous requests with identical idempotency key
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${testUser.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One request must succeed (201) or replay (201), the other must either hit in-flight lock (409) or replay (201)
    // If concurrent in-flight: exactly one is 409 and one is 201
    // If one finished slightly earlier: both are 201 (initial + replay)
    // In all cases, zero double-bookings!
    const countRes = await query<{ count: string }>(
      'SELECT COUNT(*) FROM bookings WHERE show_id = $1 AND id IN (SELECT booking_id FROM booking_seats WHERE show_seat_id = $2)',
      [testShowId, seatId]
    );
    expect(parseInt(countRes.rows[0].count, 10)).toBe(1);
    expect(statuses.includes(201)).toBe(true);
  });

  it('should ensure idempotent payment processing (POST /api/payments/process)', async () => {
    const seatId = availableShowSeats[4].id;
    const idempotencyKey = `pay_idem_${crypto.randomUUID()}`;

    // 1. Place a hold
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${testUser.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.data.holdId;

    const paymentPayload = {
      hold_id: holdId,
      payment_method: 'CREDIT_CARD',
      card_token: 'tok_visa_success',
    };

    // 2. First payment call
    const payRes1 = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(paymentPayload);

    expect(payRes1.status).toBe(200);
    expect(payRes1.body.success).toBe(true);
    expect(payRes1.body.data.status).toBe('SUCCESS');
    const paymentId = payRes1.body.data.paymentId;
    const txnRef = payRes1.body.data.transactionReference;

    // 3. Retried payment call with identical Idempotency-Key
    const payRes2 = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(paymentPayload);

    expect(payRes2.status).toBe(200);
    expect(payRes2.body.success).toBe(true);
    expect(payRes2.headers['idempotent-replayed']).toBe('true');
    expect(payRes2.body.data.paymentId).toBe(paymentId);
    expect(payRes2.body.data.transactionReference).toBe(txnRef);

    // 4. Verify exactly 1 payment record in PostgreSQL
    const pCount = await query<{ count: string }>(
      'SELECT COUNT(*) FROM payments WHERE id = $1',
      [paymentId]
    );
    expect(parseInt(pCount.rows[0].count, 10)).toBe(1);
  });

  it('should replay client errors (404) consistently when retried with same key', async () => {
    const nonExistentShowId = '00000000-0000-0000-0000-000000000099';
    const fakeSeatId = '00000000-0000-0000-0000-000000000098';
    const idempotencyKey = `idem_err_${crypto.randomUUID()}`;

    const payload = {
      show_id: nonExistentShowId,
      show_seat_ids: [fakeSeatId],
    };

    // 1. First attempt fails with 404
    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(404);
    expect(res1.body.success).toBe(false);

    // 2. Replay with same key returns cached 404
    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(404);
    expect(res2.body.success).toBe(false);
    expect(res2.headers['idempotent-replayed']).toBe('true');
  });

  it('should fall back to PostgreSQL idempotency record when Redis cache is evicted', async () => {
    const seatId = availableShowSeats[5].id;
    const idempotencyKey = `idem_fallback_${crypto.randomUUID()}`;

    const payload = {
      show_id: testShowId,
      show_seat_ids: [seatId],
    };

    // 1. Initial request
    const res1 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(201);
    const bookingId = res1.body.data.id;

    // 2. Manually evict the Redis cache key to simulate TTL expiration or cache clear
    await redisService.del(`idemp:resp:${testUser.id}:${idempotencyKey}`);

    // Verify key is gone in Redis
    expect(await redisService.exists(`idemp:resp:${testUser.id}:${idempotencyKey}`)).toBe(false);

    // 3. Retry request — should fall back to PostgreSQL and successfully replay!
    const res2 = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${testUser.token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(201);
    expect(res2.headers['idempotent-replayed']).toBe('true');
    expect(res2.body.data.id).toBe(bookingId);

    // 4. Verify Redis was backfilled from PostgreSQL
    expect(await redisService.exists(`idemp:resp:${testUser.id}:${idempotencyKey}`)).toBe(true);
  });
});

