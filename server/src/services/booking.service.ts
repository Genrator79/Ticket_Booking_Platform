import { withTransaction } from '../db/index.js';
import { BookingRepository, bookingRepository } from '../repositories/booking.repository.js';
import { ShowRepository, showRepository } from '../repositories/show.repository.js';
import { BookingWithDetails, CreateBookingDTO } from '../types/booking.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { holdService, HoldService } from './hold.service.js';

export class BookingService {
  constructor(
    private repo: BookingRepository = bookingRepository,
    private showRepo: ShowRepository = showRepository,
    private holdSvc: HoldService = holdService
  ) {}

  /**
   * Books seats inside a PostgreSQL transaction using pessimistic row-level locking.
   * Supports two booking paths:
   * 1. Booking from a verified temporary seat hold (hold_id)
   * 2. Direct booking (validates that no requested seat is held in Redis by another user)
   */
  async createBooking(userId: string, input: CreateBookingDTO): Promise<BookingWithDetails> {
    let showId = input.show_id;
    let seatIds = input.show_seat_ids;
    let holdId = input.hold_id;

    // Path 1: Booking using a verified temporary seat hold
    if (holdId) {
      const activeHold = await this.holdSvc.getHold(holdId, userId);
      showId = activeHold.showId;
      seatIds = activeHold.showSeatIds;
    }

    if (!showId || !seatIds || seatIds.length === 0) {
      throw new BadRequestError('Show ID and at least one seat must be selected for booking');
    }

    // Ensure distinct seat IDs
    const uniqueSeatIds = Array.from(new Set(seatIds));
    if (uniqueSeatIds.length !== seatIds.length) {
      throw new BadRequestError('Duplicate seat IDs detected in request');
    }

    // Path 2: Direct booking without hold — ensure no seats are currently held in Redis
    if (!holdId) {
      const heldSeatIds = await this.holdSvc.getActiveHeldSeatIds(showId, uniqueSeatIds);
      if (heldSeatIds.size > 0) {
        throw new ConflictError('One or more selected seats are currently held by another customer');
      }
    }

    const show = await this.showRepo.findById(showId);
    if (!show) {
      throw new NotFoundError(`Show with ID ${showId} not found`);
    }

    const createdBooking = await withTransaction(async (client) => {
      // 1. Acquire pessimistic row-level locks on requested show_seats in sorted order
      const seats = await this.repo.getShowSeatsForUpdate(client, uniqueSeatIds);

      if (seats.length !== uniqueSeatIds.length) {
        throw new BadRequestError('One or more requested seats could not be found');
      }

      // 2. Validate show ownership and availability inside the locked transaction
      for (const seat of seats) {
        if (seat.show_id !== showId) {
          throw new BadRequestError(`Seat ${seat.seat_label} does not belong to show ${showId}`);
        }
        if (seat.status !== 'AVAILABLE') {
          throw new ConflictError(`Seat ${seat.seat_label} is no longer available (${seat.status})`);
        }
      }

      // 3. Compute total amount
      const totalAmount = seats.reduce((sum, seat) => sum + Number(seat.price), 0);

      // 4. Create booking record
      const booking = await this.repo.createBookingRecord(client, {
        user_id: userId,
        show_id: showId,
        total_amount: totalAmount,
        status: 'CONFIRMED',
      });

      // 5. Create itemized booking_seats records
      const seatItems = seats.map((s) => ({
        show_seat_id: s.id,
        price: Number(s.price),
      }));
      await this.repo.createBookingSeats(client, booking.id, seatItems);

      // 6. Transition show_seats status to BOOKED with version increment
      const updatedCount = await this.repo.updateShowSeatsStatus(
        client,
        uniqueSeatIds,
        'BOOKED'
      );

      if (updatedCount !== uniqueSeatIds.length) {
        throw new ConflictError('Concurrent modification detected: unable to claim all seats');
      }

      return booking;
    });

    // Clean up temporary hold from Redis if booking succeeded from hold
    if (holdId) {
      await this.holdSvc.releaseHold(holdId, userId).catch((err) => {
        console.error(`[Hold Cleanup Warning] Failed to release hold ${holdId} after booking:`, err.message);
      });
    }

    const fullBooking = await this.repo.findById(createdBooking.id);
    if (!fullBooking) {
      throw new NotFoundError('Failed to retrieve finalized booking details');
    }

    return fullBooking;
  }

  /**
   * Intentionally vulnerable booking method that omits `FOR UPDATE` row-locking
   * and introduces an artificial delay between availability check and booking write.
   * Used strictly in tests to demonstrate the race condition vulnerability.
   */
  async createBookingWithoutLocking(
    userId: string,
    input: CreateBookingDTO,
    delayMs = 50
  ): Promise<BookingWithDetails> {
    const { show_id, show_seat_ids } = input;
    if (!show_id || !show_seat_ids || show_seat_ids.length === 0) {
      throw new BadRequestError('Show ID and seat IDs are required');
    }
    const uniqueSeatIds = Array.from(new Set(show_seat_ids));

    const createdBooking = await withTransaction(async (client) => {
      // Intentionally vulnerable: plain SELECT without row-locking
      const seats = await this.repo.getShowSeatsByIds(uniqueSeatIds, client);

      for (const seat of seats) {
        if (seat.status !== 'AVAILABLE') {
          throw new ConflictError(`Seat ${seat.seat_label} is no longer available (${seat.status})`);
        }
      }

      // Artificial window where competing transactions read the same uncommitted status
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const totalAmount = seats.reduce((sum, seat) => sum + Number(seat.price), 0);
      const booking = await this.repo.createBookingRecord(client, {
        user_id: userId,
        show_id,
        total_amount: totalAmount,
        status: 'CONFIRMED',
      });

      const seatItems = seats.map((s) => ({
        show_seat_id: s.id,
        price: Number(s.price),
      }));
      await this.repo.createBookingSeats(client, booking.id, seatItems);
      await this.repo.updateShowSeatsStatus(client, uniqueSeatIds, 'BOOKED');

      return booking;
    });

    const fullBooking = await this.repo.findById(createdBooking.id);
    return fullBooking!;
  }

  /**
   * Retrieves all bookings for the authenticated user.
   */
  async getUserBookings(userId: string): Promise<BookingWithDetails[]> {
    return this.repo.findByUserId(userId);
  }

  /**
   * Retrieves a single booking with strict authorization enforcement.
   */
  async getBookingById(
    bookingId: string,
    requestingUser: { userId: string; role: string }
  ): Promise<BookingWithDetails> {
    const booking = await this.repo.findById(bookingId);
    if (!booking) {
      throw new NotFoundError(`Booking with ID ${bookingId} not found`);
    }

    // Authorization: User can only view their own bookings unless they are an admin
    if (requestingUser.role !== 'admin' && booking.user_id !== requestingUser.userId) {
      throw new ForbiddenError('You do not have permission to view this booking');
    }

    return booking;
  }
}

export const bookingService = new BookingService();

