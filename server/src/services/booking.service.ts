import { withTransaction } from '../db/index.js';
import { BookingRepository, bookingRepository } from '../repositories/booking.repository.js';
import { ShowRepository, showRepository } from '../repositories/show.repository.js';
import { BookingWithDetails, CreateBookingDTO } from '../types/booking.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class BookingService {
  constructor(
    private repo: BookingRepository = bookingRepository,
    private showRepo: ShowRepository = showRepository
  ) {}

  /**
   * Creates a basic booking within a PostgreSQL transaction.
   * Checks availability, inserts booking record, creates booking_seats,
   * and updates seat status to BOOKED.
   */
  async createBooking(userId: string, input: CreateBookingDTO): Promise<BookingWithDetails> {
    const { show_id, show_seat_ids } = input;

    if (!show_seat_ids || show_seat_ids.length === 0) {
      throw new BadRequestError('At least one seat must be selected for booking');
    }

    // Ensure distinct seat IDs
    const uniqueSeatIds = Array.from(new Set(show_seat_ids));
    if (uniqueSeatIds.length !== show_seat_ids.length) {
      throw new BadRequestError('Duplicate seat IDs detected in request');
    }

    const show = await this.showRepo.findById(show_id);
    if (!show) {
      throw new NotFoundError(`Show with ID ${show_id} not found`);
    }

    const createdBooking = await withTransaction(async (client) => {
      // 1. Fetch seat records
      const seats = await this.repo.getShowSeatsByIds(uniqueSeatIds, client);

      if (seats.length !== uniqueSeatIds.length) {
        throw new BadRequestError('One or more requested seats could not be found');
      }

      // 2. Validate show ownership and availability
      for (const seat of seats) {
        if (seat.show_id !== show_id) {
          throw new BadRequestError(`Seat ${seat.seat_label} does not belong to show ${show_id}`);
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
        show_id,
        total_amount: totalAmount,
        status: 'CONFIRMED',
      });

      // 5. Create itemized booking_seats records
      const seatItems = seats.map((s) => ({
        show_seat_id: s.id,
        price: Number(s.price),
      }));
      await this.repo.createBookingSeats(client, booking.id, seatItems);

      // 6. Update show_seats status to BOOKED
      await this.repo.updateShowSeatsStatus(client, uniqueSeatIds, 'BOOKED');

      return booking;
    });

    const fullBooking = await this.repo.findById(createdBooking.id);
    if (!fullBooking) {
      throw new NotFoundError('Failed to retrieve finalized booking details');
    }

    return fullBooking;
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

