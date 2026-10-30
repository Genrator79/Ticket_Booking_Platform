import crypto from 'crypto';
import { env } from '../config/env.js';
import { getRedisClient } from '../redis/index.js';
import { redisService } from '../redis/redis.service.js';
import { bookingRepository, BookingRepository } from '../repositories/booking.repository.js';
import { showRepository, ShowRepository } from '../repositories/show.repository.js';
import { CreateHoldDTO, SeatHold } from '../types/hold.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class HoldService {
  constructor(
    private showRepo: ShowRepository = showRepository,
    private bookingRepo: BookingRepository = bookingRepository
  ) {}

  private get redis() {
    return getRedisClient();
  }

  private getSeatKey(showId: string, showSeatId: string): string {
    return `seat_hold:${showId}:${showSeatId}`;
  }

  private getHoldKey(holdId: string): string {
    return `hold:${holdId}`;
  }

  /**
   * Atomically acquires temporary holds on multiple seats using a Redis Lua script.
   * If even a single seat is already held or booked, zero seats are claimed.
   */
  async createHold(userId: string, input: CreateHoldDTO): Promise<SeatHold> {
    const { show_id, show_seat_ids, ttl_seconds } = input;
    const ttl = ttl_seconds || env.SEAT_HOLD_TTL_SECONDS;

    if (!show_seat_ids || show_seat_ids.length === 0) {
      throw new BadRequestError('At least one seat must be selected to place a hold');
    }

    // Deduplicate seat IDs
    const uniqueSeatIds = Array.from(new Set(show_seat_ids));
    if (uniqueSeatIds.length !== show_seat_ids.length) {
      throw new BadRequestError('Duplicate seat IDs detected in hold request');
    }

    // 1. Validate show exists in database
    const show = await this.showRepo.findById(show_id);
    if (!show) {
      throw new NotFoundError(`Show with ID ${show_id} not found`);
    }

    // 2. Fetch seats from database to verify existence and permanent state
    const seats = await this.bookingRepo.getShowSeatsByIds(uniqueSeatIds);
    if (seats.length !== uniqueSeatIds.length) {
      throw new BadRequestError('One or more requested seats could not be found');
    }

    // 3. Verify show ownership and check if already permanently BOOKED in PostgreSQL
    for (const seat of seats) {
      if (seat.show_id !== show_id) {
        throw new BadRequestError(`Seat ${seat.seat_label} does not belong to show ${show_id}`);
      }
      if (seat.status === 'BOOKED') {
        throw new ConflictError(`Seat ${seat.seat_label} is already permanently booked`);
      }
    }

    const holdId = crypto.randomUUID();
    const seatKeys = uniqueSeatIds.map((seatId) => this.getSeatKey(show_id, seatId));

    // 4. Redis Lua Script for 100% Atomic All-or-Nothing Multi-Seat Hold Acquisition
    // KEYS: array of seat lock keys
    // ARGV[1]: hold_id
    // ARGV[2]: user_id
    // ARGV[3]: ttl_in_seconds
    const luaScript = `
      for i = 1, #KEYS do
        if redis.call('EXISTS', KEYS[i]) == 1 then
          return { 0, KEYS[i] }
        end
      end
      local val = ARGV[1] .. ':' .. ARGV[2]
      for i = 1, #KEYS do
        redis.call('SET', KEYS[i], val, 'EX', tonumber(ARGV[3]))
      end
      return { 1, 'OK' }
    `;

    const result = (await this.redis.eval(
      luaScript,
      seatKeys.length,
      ...seatKeys,
      holdId,
      userId,
      ttl.toString()
    )) as [number, string];

    const [status, conflictingKey] = result;

    if (status === 0) {
      // Find the seat label corresponding to the conflicting key
      const conflictingSeatId = conflictingKey.split(':').pop();
      const conflictingSeat = seats.find((s) => s.id === conflictingSeatId);
      const label = conflictingSeat ? conflictingSeat.seat_label : 'a selected seat';
      throw new ConflictError(`Seat ${label} is currently held by another customer. Please choose different seats.`);
    }

    // 5. Compute total price
    const totalAmount = seats.reduce((sum, s) => sum + Number(s.price), 0);
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const seatLabels = seats.map((s) => s.seat_label);

    const holdData: SeatHold = {
      holdId,
      userId,
      showId: show_id,
      showSeatIds: uniqueSeatIds,
      seatLabels,
      totalAmount,
      expiresAt,
      expiresInSeconds: ttl,
      status: 'HELD',
      createdAt: new Date().toISOString(),
    };

    // 6. Store hold metadata in Redis with matching TTL
    await redisService.setJSON(this.getHoldKey(holdId), holdData, ttl);

    return holdData;
  }

  /**
   * Retrieves an active seat hold and verifies ownership.
   */
  async getHold(holdId: string, userId: string): Promise<SeatHold> {
    const holdKey = this.getHoldKey(holdId);
    const hold = await redisService.getJSON<SeatHold>(holdKey);

    if (!hold) {
      throw new NotFoundError('Seat hold not found or has expired');
    }

    if (hold.userId !== userId) {
      throw new ForbiddenError('You do not have permission to view this seat hold');
    }

    const ttl = await redisService.ttl(holdKey);
    if (ttl <= 0) {
      throw new NotFoundError('Seat hold has expired');
    }

    return {
      ...hold,
      expiresInSeconds: ttl,
    };
  }

  /**
   * Releases an active seat hold immediately.
   */
  async releaseHold(holdId: string, userId: string): Promise<void> {
    const holdKey = this.getHoldKey(holdId);
    const hold = await redisService.getJSON<SeatHold>(holdKey);

    if (!hold) {
      // Already expired or released
      return;
    }

    if (hold.userId !== userId) {
      throw new ForbiddenError('You do not have permission to release this seat hold');
    }

    const seatKeys = hold.showSeatIds.map((seatId) => this.getSeatKey(hold.showId, seatId));

    // Release seat keys matching this holdId
    const releaseLua = `
      for i = 1, #KEYS do
        local val = redis.call('GET', KEYS[i])
        if val and string.sub(val, 1, string.len(ARGV[1])) == ARGV[1] then
          redis.call('DEL', KEYS[i])
        end
      end
      return 1
    `;

    await this.redis.eval(releaseLua, seatKeys.length, ...seatKeys, holdId);
    await redisService.del(holdKey);
  }

  /**
   * Returns a set of currently held seat IDs for a given show.
   * Efficiently queries Redis via MGET without scanning keys.
   */
  async getActiveHeldSeatIds(showId: string, showSeatIds: string[]): Promise<Set<string>> {
    if (!showSeatIds || showSeatIds.length === 0) {
      return new Set();
    }

    const seatKeys = showSeatIds.map((id) => this.getSeatKey(showId, id));
    const values = await this.redis.mget(...seatKeys);

    const heldSeatIds = new Set<string>();
    for (let i = 0; i < values.length; i++) {
      if (values[i] !== null) {
        heldSeatIds.add(showSeatIds[i]);
      }
    }

    return heldSeatIds;
  }
}

export const holdService = new HoldService();

