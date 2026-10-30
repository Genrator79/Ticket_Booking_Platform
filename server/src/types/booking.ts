export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface Booking {
  id: string;
  user_id: string;
  show_id: string;
  status: BookingStatus;
  total_amount: string | number;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BookingSeat {
  id: string;
  booking_id: string;
  show_seat_id: string;
  price: string | number;
  created_at: Date;
}

export interface BookingSeatDetail {
  id: string;
  show_seat_id: string;
  seat_label: string;
  row: string;
  number: number;
  tier: string;
  price: number;
}

export interface BookingWithDetails extends Booking {
  movie_title: string;
  movie_poster_url: string | null;
  venue_name: string;
  venue_city: string;
  screen_name: string;
  start_time: Date;
  end_time: Date;
  seats: BookingSeatDetail[];
}

export interface CreateBookingDTO {
  show_id?: string;
  show_seat_ids?: string[];
  hold_id?: string;
}

