import api from './api';
import type { ApiResponse } from '../types/api';
import type { BookingWithDetails, CreateBookingPayload } from '../types/booking';

export const bookingService = {
  /**
   * Submits a booking request for selected show seats.
   * Sends an Idempotency-Key header to prevent duplicate bookings upon retries.
   */
  async createBooking(
    payload: CreateBookingPayload,
    idempotencyKey?: string
  ): Promise<BookingWithDetails> {
    const key = idempotencyKey || payload.idempotency_key;
    const headers = key ? { 'Idempotency-Key': key } : undefined;
    const res = await api.post<ApiResponse<BookingWithDetails>>('/bookings', payload, { headers });
    if (!res.data.data) {
      throw new Error(res.data.message || 'Booking creation failed');
    }
    return res.data.data;
  },

  /**
   * Retrieves booking history for the logged-in user.
   */
  async getMyBookings(): Promise<BookingWithDetails[]> {
    const res = await api.get<ApiResponse<BookingWithDetails[]>>('/bookings');
    return res.data.data || [];
  },

  /**
   * Retrieves booking confirmation by ID.
   */
  async getBookingById(bookingId: string): Promise<BookingWithDetails> {
    const res = await api.get<ApiResponse<BookingWithDetails>>(`/bookings/${bookingId}`);
    if (!res.data.data) {
      throw new Error(res.data.message || 'Booking not found');
    }
    return res.data.data;
  },
};

