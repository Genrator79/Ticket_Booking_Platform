export interface Movie {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  genre: string;
  rating: string | null;
  poster_url: string | null;
  release_date: string | null;
  created_at: string;
}

export interface Show {
  id: string;
  movie_id: string;
  screen_id: string;
  start_time: string;
  end_time: string;
  base_price: string | number;
  movie_title: string;
  movie_poster_url: string | null;
  movie_genre: string;
  movie_duration: number;
  venue_id: string;
  venue_name: string;
  venue_city: string;
  screen_name: string;
}

export type ShowSeatStatus = 'AVAILABLE' | 'HELD' | 'BOOKED';

export interface ShowSeat {
  id: string;
  show_id: string;
  seat_id: string;
  status: ShowSeatStatus;
  price: string | number;
  row: string;
  number: number;
  seat_label: string;
  tier: 'STANDARD' | 'PREMIUM' | 'VIP';
}

export interface ShowSeatsResponse {
  showId: string;
  totalSeats: number;
  availableSeats: number;
  seats: ShowSeat[];
}

