import http from 'http';
import { AddressInfo } from 'net';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { initSocketServer, closeSocket } from '../src/socket/index.js';
import { closePool, query } from '../src/db/index.js';
import { closeRedis } from '../src/redis/index.js';
import { env } from '../src/config/env.js';
import { holdService } from '../src/services/hold.service.js';
import { bookingService } from '../src/services/booking.service.js';
import { paymentService } from '../src/services/payment.service.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SeatHeldEventPayload,
  SeatReleasedEventPayload,
  SeatBookedEventPayload,
} from '../src/types/socket.js';

type TypedClientSocket = ClientSocketType<ServerToClientEvents, ClientToServerEvents>;

describe('M11 — Socket.IO Real-Time Updates Integration Tests', () => {
  let httpServer: http.Server;
  let serverPort: number;
  let socketUrl: string;

  let testUser = { id: '', email: 'socketholder@example.com', token: '' };
  let testShowId = '';
  let otherShowId = '';
  let availableShowSeats: { id: string; price: number; seat_label: string }[] = [];
  let otherShowSeats: { id: string; price: number; seat_label: string }[] = [];

  beforeAll(async () => {
    // 1. Initialize HTTP + Socket.IO Server on an ephemeral port
    const app = createApp();
    httpServer = http.createServer(app);
    initSocketServer(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        serverPort = (httpServer.address() as AddressInfo).port;
        socketUrl = `http://localhost:${serverPort}`;
        resolve();
      });
    });

    // 2. Database Fixtures Setup & Cleanup
    await query(
      `DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [testUser.email]
    );
    await query(
      `DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email = $1))`,
      [testUser.email]
    );
    await query(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [testUser.email]);
    await query(`DELETE FROM users WHERE email = $1`, [testUser.email]);

    const u = await query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash, role) 
       VALUES ('Socket Tester', $1, 'hash_socket', 'customer') RETURNING id`,
      [testUser.email]
    );
    testUser.id = u.rows[0].id;
    testUser.token = jwt.sign(
      { userId: testUser.id, email: testUser.email, role: 'customer' },
      env.JWT_SECRET
    );

    // Fetch two distinct active shows for room-isolation testing
    const showRows = await query<{ id: string }>(
      `SELECT id FROM shows LIMIT 2`
    );
    if (showRows.rows.length < 2) {
      throw new Error('Test database must have at least two scheduled shows');
    }
    testShowId = showRows.rows[0].id;
    otherShowId = showRows.rows[1].id;

    // Reset and fetch available seats for testShowId
    const seatCleanupRows = await query<{ id: string }>(
      `SELECT id FROM show_seats WHERE show_id IN ($1, $2)`,
      [testShowId, otherShowId]
    );
    const cleanupSeatIds = seatCleanupRows.rows.map((r) => r.id);
    if (cleanupSeatIds.length > 0) {
      await query(`DELETE FROM booking_seats WHERE show_seat_id = ANY($1)`, [cleanupSeatIds]);
    }

    await query(
      `UPDATE show_seats SET status = 'AVAILABLE', version = 0 WHERE show_id = $1`,
      [testShowId]
    );
    const s1 = await query<{ id: string; price: number; seat_label: string }>(
      `SELECT ss.id, ss.price, s.row || s.number as seat_label
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1
       ORDER BY ss.id ASC LIMIT 10`,
      [testShowId]
    );
    availableShowSeats = s1.rows;

    // Reset seats for otherShowId
    await query(
      `UPDATE show_seats SET status = 'AVAILABLE', version = 0 WHERE show_id = $1`,
      [otherShowId]
    );
    const s2 = await query<{ id: string; price: number; seat_label: string }>(
      `SELECT ss.id, ss.price, s.row || s.number as seat_label
       FROM show_seats ss
       JOIN seats s ON ss.seat_id = s.id
       WHERE ss.show_id = $1
       ORDER BY ss.id ASC LIMIT 5`,
      [otherShowId]
    );
    otherShowSeats = s2.rows;
  });

  beforeEach(async () => {
    // Clear Redis seat hold keys
    const keys = await (await import('../src/redis/redis.service.js')).redisService.keys('seat_hold:*');
    const holdKeys = await (await import('../src/redis/redis.service.js')).redisService.keys('hold:*');
    const all = [...keys, ...holdKeys];
    if (all.length > 0) {
      await (await import('../src/redis/redis.service.js')).redisService.del(all);
    }
  });

  afterAll(async () => {
    // Teardown sockets, HTTP server, Redis, and DB pool
    await closeSocket();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closeRedis();
    await closePool();
  });

  test('1. Client can connect as guest or authenticated user and handshake succeeds', async () => {
    // Guest connection
    const guestSocket: TypedClientSocket = ClientSocket(socketUrl, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve, reject) => {
      guestSocket.on('connect', () => {
        expect(guestSocket.connected).toBe(true);
        guestSocket.disconnect();
        resolve();
      });
      guestSocket.on('connect_error', reject);
    });

    // Authenticated connection
    const authSocket: TypedClientSocket = ClientSocket(socketUrl, {
      transports: ['websocket'],
      auth: { token: testUser.token },
    });

    await new Promise<void>((resolve, reject) => {
      authSocket.on('connect', () => {
        expect(authSocket.connected).toBe(true);
        authSocket.disconnect();
        resolve();
      });
      authSocket.on('connect_error', reject);
    });
  });

  test('2. Client can join and leave show rooms with callback acknowledgments', async () => {
    const client: TypedClientSocket = ClientSocket(socketUrl, {
      transports: ['websocket'],
    });

    await new Promise<void>((resolve) => client.on('connect', resolve));

    // Join room with acknowledgment
    const joinRes = await new Promise<{ success: boolean; room: string }>((resolve) => {
      client.emit('join:show', { showId: testShowId }, (response) => {
        resolve(response);
      });
    });

    expect(joinRes.success).toBe(true);
    expect(joinRes.room).toBe(`show:${testShowId}`);

    // Leave room with acknowledgment
    const leaveRes = await new Promise<{ success: boolean }>((resolve) => {
      client.emit('leave:show', { showId: testShowId }, (response) => {
        resolve(response);
      });
    });

    expect(leaveRes.success).toBe(true);

    client.disconnect();
  });

  test('3. Clients in show room receive "seat:held" event when HoldService.createHold executes', async () => {
    const viewer1: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });
    const viewer2: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((res) => viewer1.on('connect', res)),
      new Promise<void>((res) => viewer2.on('connect', res)),
    ]);

    // Both viewers join testShowId room
    await Promise.all([
      new Promise((res) => viewer1.emit('join:show', { showId: testShowId }, res)),
      new Promise((res) => viewer2.emit('join:show', { showId: testShowId }, res)),
    ]);

    const targetSeats = [availableShowSeats[0].id, availableShowSeats[1].id];

    // Setup listener for seat:held on both viewers
    const v1Promise = new Promise<SeatHeldEventPayload>((res) => viewer1.once('seat:held', res));
    const v2Promise = new Promise<SeatHeldEventPayload>((res) => viewer2.once('seat:held', res));

    // Trigger hold
    const hold = await holdService.createHold(testUser.id, {
      show_id: testShowId,
      show_seat_ids: targetSeats,
      ttl_seconds: 30,
    });

    const [v1Payload, v2Payload] = await Promise.all([v1Promise, v2Promise]);

    expect(v1Payload.showId).toBe(testShowId);
    expect(v1Payload.seatIds).toEqual(targetSeats);
    expect(v1Payload.heldByUserId).toBe(testUser.id);
    expect(v2Payload.seatIds).toEqual(targetSeats);

    // Clean up hold
    await holdService.releaseHold(hold.holdId, testUser.id, false);

    viewer1.disconnect();
    viewer2.disconnect();
  });

  test('4. Clients in show room receive "seat:released" event when HoldService.releaseHold executes', async () => {
    const viewer: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => viewer.on('connect', res));
    await new Promise((res) => viewer.emit('join:show', { showId: testShowId }, res));

    const targetSeats = [availableShowSeats[2].id];
    const hold = await holdService.createHold(testUser.id, {
      show_id: testShowId,
      show_seat_ids: targetSeats,
      ttl_seconds: 30,
    });

    const releasePromise = new Promise<SeatReleasedEventPayload>((res) => viewer.once('seat:released', res));

    // Release hold manually
    await holdService.releaseHold(hold.holdId, testUser.id, true);

    const payload = await releasePromise;
    expect(payload.showId).toBe(testShowId);
    expect(payload.seatIds).toEqual(targetSeats);
    expect(payload.reason).toBe('manual');

    viewer.disconnect();
  });

  test('5. Clients in show room receive "seat:booked" event when BookingService.createBooking completes', async () => {
    const viewer: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => viewer.on('connect', res));
    await new Promise((res) => viewer.emit('join:show', { showId: testShowId }, res));

    const targetSeats = [availableShowSeats[3].id, availableShowSeats[4].id];

    const bookedPromise = new Promise<SeatBookedEventPayload>((res) => viewer.once('seat:booked', res));

    const booking = await bookingService.createBooking(testUser.id, {
      show_id: testShowId,
      show_seat_ids: targetSeats,
    });

    const payload = await bookedPromise;
    expect(payload.showId).toBe(testShowId);
    expect(payload.seatIds).toEqual(targetSeats);
    expect(payload.bookingId).toBe(booking.id);

    viewer.disconnect();
  });

  test('6. Room isolation: events emitted for Show A are NOT received by clients watching Show B', async () => {
    const showAClient: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });
    const showBClient: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });

    await Promise.all([
      new Promise<void>((res) => showAClient.on('connect', res)),
      new Promise<void>((res) => showBClient.on('connect', res)),
    ]);

    await Promise.all([
      new Promise((res) => showAClient.emit('join:show', { showId: testShowId }, res)),
      new Promise((res) => showBClient.emit('join:show', { showId: otherShowId }, res)),
    ]);

    let showBReceivedEvent = false;
    showBClient.on('seat:held', () => {
      showBReceivedEvent = true;
    });

    const showAPromise = new Promise<SeatHeldEventPayload>((res) => showAClient.once('seat:held', res));

    // Place hold on Show A
    const holdA = await holdService.createHold(testUser.id, {
      show_id: testShowId,
      show_seat_ids: [availableShowSeats[5].id],
      ttl_seconds: 30,
    });

    const payloadA = await showAPromise;
    expect(payloadA.showId).toBe(testShowId);

    // Give short buffer to verify Show B never received the event
    await new Promise((res) => setTimeout(res, 50));
    expect(showBReceivedEvent).toBe(false);

    await holdService.releaseHold(holdA.holdId, testUser.id, false);

    showAClient.disconnect();
    showBClient.disconnect();
  });

  test('7. Payment lifecycle broadcasts: "seat:booked" on success and "seat:released" on decline or refund', async () => {
    const viewer: TypedClientSocket = ClientSocket(socketUrl, { transports: ['websocket'] });
    await new Promise<void>((res) => viewer.on('connect', res));
    await new Promise((res) => viewer.emit('join:show', { showId: testShowId }, res));

    // Scenario A: Payment Declined -> seat:released with reason payment_failed
    const holdFailed = await holdService.createHold(testUser.id, {
      show_id: testShowId,
      show_seat_ids: [availableShowSeats[6].id],
      ttl_seconds: 60,
    });

    const declinePromise = new Promise<SeatReleasedEventPayload>((res) => viewer.once('seat:released', res));

    await paymentService.processPayment(testUser.id, {
      hold_id: holdFailed.holdId,
      card_token: 'tok_decline_insufficient_funds',
    });

    const declinePayload = await declinePromise;
    expect(declinePayload.showId).toBe(testShowId);
    expect(declinePayload.seatIds).toEqual([availableShowSeats[6].id]);
    expect(declinePayload.reason).toBe('payment_failed');

    // Scenario B: Payment Succeeded -> seat:booked
    const holdSuccess = await holdService.createHold(testUser.id, {
      show_id: testShowId,
      show_seat_ids: [availableShowSeats[7].id],
      ttl_seconds: 60,
    });

    const bookedPromise = new Promise<SeatBookedEventPayload>((res) => viewer.once('seat:booked', res));

    const paymentReceipt = await paymentService.processPayment(testUser.id, {
      hold_id: holdSuccess.holdId,
      card_token: 'tok_visa_success',
    });

    const bookedPayload = await bookedPromise;
    expect(bookedPayload.showId).toBe(testShowId);
    expect(bookedPayload.seatIds).toEqual([availableShowSeats[7].id]);
    expect(bookedPayload.bookingId).toBe(paymentReceipt.bookingId);

    // Scenario C: Refund -> seat:released
    const refundPromise = new Promise<SeatReleasedEventPayload>((res) => viewer.once('seat:released', res));

    await paymentService.processRefund(paymentReceipt.paymentId, {
      userId: testUser.id,
      role: 'customer',
    });

    const refundPayload = await refundPromise;
    expect(refundPayload.showId).toBe(testShowId);
    expect(refundPayload.seatIds).toEqual([availableShowSeats[7].id]);
    expect(refundPayload.reason).toBe('manual');

    viewer.disconnect();
  });
});
