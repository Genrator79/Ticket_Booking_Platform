export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED' | 'FAILED';

export interface BookingSeatDetail {
  id: string;
  show_seat_id: string;
  seat_label: string;
  row: string;
  number: number;
  tier: string;
  price: number;
}

export interface BookingWithDetails {
  id: string;
  user_id: string;
  show_id: string;
  status: BookingStatus;
  total_amount: string | number;
  created_at: string;
  movie_title: string;
  movie_poster_url: string | null;
  venue_name: string;
  venue_city: string;
  screen_name: string;
  start_time: string;
  end_time: string;
  seats: BookingSeatDetail[];
}

export interface CreateBookingPayload {
  show_id: string;
  show_seat_ids: string[];
}
