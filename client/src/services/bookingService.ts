import api from './api';
import type { ApiResponse } from '../types/api';
import type { BookingWithDetails, CreateBookingPayload } from '../types/booking';

export const bookingService = {
  /**
   * Submits a booking request for selected show seats.
   */
  async createBooking(payload: CreateBookingPayload): Promise<BookingWithDetails> {
    const res = await api.post<ApiResponse<BookingWithDetails>>('/bookings', payload);
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

