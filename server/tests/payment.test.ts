import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { closeRedis } from '../src/redis/index';
import { redisService } from '../src/redis/redis.service';
import { env } from '../src/config/env';

describe('M09 — Payment Simulation Integration Tests', () => {
  const app = createApp();

  let user1 = { id: '', email: 'payer1@example.com', token: '' };
  let user2 = { id: '', email: 'payer2@example.com', token: '' };
  let testShowId = '';
  let availableShowSeats: { id: string; price: number; seat_label: string }[] = [];

  beforeAll(async () => {
    // 1. Clean up existing test data
    await query(
      `DELETE FROM payments 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email IN ($1, $2)))`,
      [user1.email, user2.email]
    );
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

    // 2. Create test users
    const u1 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Payer One', $1, 'hash1', 'customer') RETURNING id`,
      [user1.email]
    );
    user1.id = u1.rows[0].id;
    user1.token = jwt.sign(
      { userId: user1.id, email: user1.email, role: 'customer' },
      env.JWT_SECRET
    );

    const u2 = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Payer Two', $1, 'hash2', 'customer') RETURNING id`,
      [user2.email]
    );
    user2.id = u2.rows[0].id;
    user2.token = jwt.sign(
      { userId: user2.id, email: user2.email, role: 'customer' },
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
    const keys = await redisService.keys('seat_hold:*');
    const holdKeys = await redisService.keys('hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }
  });

  afterAll(async () => {
    const keys = await redisService.keys('seat_hold:*');
    const holdKeys = await redisService.keys('hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await redisService.del(all);
    }

    const seatIds = availableShowSeats.map((s) => s.id);
    await query(
      `DELETE FROM payments 
       WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN ($1, $2))`,
      [user1.id, user2.id]
    );
    await query('DELETE FROM booking_seats WHERE show_seat_id = ANY($1)', [seatIds]);
    await query('DELETE FROM bookings WHERE user_id IN ($1, $2)', [user1.id, user2.id]);
    await query("UPDATE show_seats SET status = 'AVAILABLE' WHERE id = ANY($1)", [seatIds]);
    await query('DELETE FROM users WHERE email IN ($1, $2)', [user1.email, user2.email]);

    await closePool();
    await closeRedis();
  });

  it('POST /api/payments/process should successfully process payment from an active hold and confirm booking', async () => {
    const seatId = availableShowSeats[0].id;

    // 1. Create a hold
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    expect(holdRes.status).toBe(201);
    const holdId = holdRes.body.data.holdId;

    // 2. Process payment
    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        hold_id: holdId,
        payment_method: 'CREDIT_CARD',
        card_token: 'tok_visa_success',
      });

    expect(payRes.status).toBe(200);
    expect(payRes.body.success).toBe(true);
    expect(payRes.body.data.status).toBe('SUCCESS');
    expect(payRes.body.data.transactionReference).toMatch(/^txn_mock_/);

    const bookingId = payRes.body.data.bookingId;

    // 3. Verify PostgreSQL states
    const bookingRow = await query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    expect(bookingRow.rows[0].status).toBe('CONFIRMED');

    const seatRow = await query<{ status: string }>('SELECT status FROM show_seats WHERE id = $1', [seatId]);
    expect(seatRow.rows[0].status).toBe('BOOKED');

    // 4. Verify Redis hold keys were released
    expect(await redisService.exists(`seat_hold:${testShowId}:${seatId}`)).toBe(false);
    expect(await redisService.exists(`hold:${holdId}`)).toBe(false);
  });

  it('POST /api/payments/process should simulate card decline and revert seat state to AVAILABLE', async () => {
    const seatId = availableShowSeats[1].id;

    // 1. Create a hold
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    // 2. Process payment with card decline token
    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        hold_id: holdId,
        payment_method: 'CREDIT_CARD',
        card_token: 'tok_decline_insufficient_funds',
      });

    expect(payRes.status).toBe(402);
    expect(payRes.body.success).toBe(false);
    expect(payRes.body.data.status).toBe('FAILED');
    expect(payRes.body.message).toContain('declined');

    // 3. Verify PostgreSQL booking transitioned to FAILED and seat reverted to AVAILABLE
    const bookingId = payRes.body.data.bookingId;
    const bookingRow = await query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    expect(bookingRow.rows[0].status).toBe('FAILED');

    const seatRow = await query<{ status: string }>('SELECT status FROM show_seats WHERE id = $1', [seatId]);
    expect(seatRow.rows[0].status).toBe('AVAILABLE');

    // 4. Seat should now be immediately holdable by another customer
    const reHoldRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user2.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    expect(reHoldRes.status).toBe(201);
  });

  it('POST /api/payments/process should simulate gateway timeout failure', async () => {
    const seatId = availableShowSeats[2].id;

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        hold_id: holdId,
        card_token: 'tok_timeout',
      });

    expect(payRes.status).toBe(402);
    expect(payRes.body.data.status).toBe('FAILED');
    expect(payRes.body.data.failureReason).toContain('timeout');
  });

  it('POST /api/payments/process should reject paying for an already CONFIRMED booking (409 Conflict)', async () => {
    const seatId = availableShowSeats[3].id;

    // 1. Hold and pay
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    const payRes1 = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        hold_id: holdId,
      });
    expect(payRes1.status).toBe(200);
    const bookingId = payRes1.body.data.bookingId;

    // 2. Second payment attempt for the same booking
    const payRes2 = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        booking_id: bookingId,
      });

    expect(payRes2.status).toBe(409);
    expect(payRes2.body.message).toContain('already confirmed and paid');
  });

  it('GET /api/payments/:id should retrieve payment details with strict ownership verification', async () => {
    const seatId = availableShowSeats[4].id;

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ hold_id: holdId });
    const paymentId = payRes.body.data.paymentId;

    // Owner (user1) retrieves payment
    const getRes = await request(app)
      .get(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.data.paymentId).toBe(paymentId);
    expect(getRes.body.data.status).toBe('SUCCESS');

    // Non-owner (user2) receives 403 Forbidden
    const forbiddenRes = await request(app)
      .get(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${user2.token}`);

    expect(forbiddenRes.status).toBe(403);
  });

  it('GET /api/payments/booking/:bookingId should list payments associated with a booking', async () => {
    const seatId = availableShowSeats[5].id;

    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ hold_id: holdId });
    const bookingId = payRes.body.data.bookingId;

    const listRes = await request(app)
      .get(`/api/payments/booking/${bookingId}`)
      .set('Authorization', `Bearer ${user1.token}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].bookingId).toBe(bookingId);
  });

  it('POST /api/payments/:id/refund should process refund, cancel booking, and restore seat to AVAILABLE', async () => {
    const seatId = availableShowSeats[6].id;

    // 1. Create hold and successful payment
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    const payRes = await request(app)
      .post('/api/payments/process')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ hold_id: holdId });
    const paymentId = payRes.body.data.paymentId;
    const bookingId = payRes.body.data.bookingId;

    // 2. Request refund
    const refundRes = await request(app)
      .post(`/api/payments/${paymentId}/refund`)
      .set('Authorization', `Bearer ${user1.token}`)
      .send({ reason: 'Customer requested cancellation' });

    expect(refundRes.status).toBe(200);
    expect(refundRes.body.success).toBe(true);
    expect(refundRes.body.data.status).toBe('REFUNDED');
    expect(refundRes.body.data.transactionReference).toMatch(/^ref_mock_/);

    // 3. Verify PostgreSQL states
    const bookingRow = await query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    expect(bookingRow.rows[0].status).toBe('CANCELLED');

    const paymentRow = await query<{ status: string }>('SELECT status FROM payments WHERE id = $1', [paymentId]);
    expect(paymentRow.rows[0].status).toBe('REFUNDED');

    const seatRow = await query<{ status: string }>('SELECT status FROM show_seats WHERE id = $1', [seatId]);
    expect(seatRow.rows[0].status).toBe('AVAILABLE');
  });

  it('POST /api/payments/webhook should handle payment.succeeded webhook and update booking state', async () => {
    const seatId = availableShowSeats[7].id;

    // 1. Create a hold
    const holdRes = await request(app)
      .post('/api/holds')
      .set('Authorization', `Bearer ${user1.token}`)
      .send({
        show_id: testShowId,
        show_seat_ids: [seatId],
      });
    const holdId = holdRes.body.data.holdId;

    // Create a pending booking manually
    const bookingRes = await query<{ id: string }>(
      `INSERT INTO bookings (user_id, show_id, total_amount, status)
       VALUES ($1, $2, 25.00, 'PENDING') RETURNING id`,
      [user1.id, testShowId]
    );
    const bookingId = bookingRes.rows[0].id;

    await query(
      `INSERT INTO booking_seats (booking_id, show_seat_id, price)
       VALUES ($1, $2, 25.00)`,
      [bookingId, seatId]
    );

    const txnRef = `txn_webhook_${Date.now()}`;
    await query(
      `INSERT INTO payments (booking_id, amount, status, provider, transaction_reference)
       VALUES ($1, 25.00, 'PENDING', 'MOCK_GATEWAY', $2)`,
      [bookingId, txnRef]
    );

    // 2. Dispatch simulated webhook
    const webhookRes = await request(app)
      .post('/api/payments/webhook')
      .send({
        event: 'payment.succeeded',
        data: {
          transaction_reference: txnRef,
        },
      });

    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.data.received).toBe(true);

    // 3. Verify booking confirmed via webhook
    const bRow = await query<{ status: string }>('SELECT status FROM bookings WHERE id = $1', [bookingId]);
    expect(bRow.rows[0].status).toBe('CONFIRMED');

    const sRow = await query<{ status: string }>('SELECT status FROM show_seats WHERE id = $1', [seatId]);
    expect(sRow.rows[0].status).toBe('BOOKED');
  });
});
