export interface Movie {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number;
  genre: string;
  rating: string | null;
  poster_url: string | null;
  release_date: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateMovieDTO {
  title: string;
  description?: string;
  duration_minutes: number;
  genre: string;
  rating?: string;
  poster_url?: string;
  release_date?: string;
}

export type UpdateMovieDTO = Partial<CreateMovieDTO>;

export interface Venue {
  id: string;
  name: string;
  city: string;
  address: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateVenueDTO {
  name: string;
  city: string;
  address: string;
}

export interface Screen {
  id: string;
  venue_id: string;
  name: string;
  total_seats: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateScreenDTO {
  name: string;
  total_seats?: number;
}

export type SeatTier = 'STANDARD' | 'PREMIUM' | 'VIP';

export interface Seat {
  id: string;
  screen_id: string;
  row: string;
  number: number;
  seat_label: string;
  tier: SeatTier;
  created_at: Date;
}

export interface CreateSeatDTO {
  row: string;
  number: number;
  seat_label: string;
  tier?: SeatTier;
}

export interface Show {
  id: string;
  movie_id: string;
  screen_id: string;
  start_time: Date;
  end_time: Date;
  base_price: string | number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateShowDTO {
  movie_id: string;
  screen_id: string;
  start_time: string | Date;
  end_time: string | Date;
  base_price: number;
}

export interface ShowWithDetails extends Show {
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
  version: number;
  updated_at: Date;
}

export interface ShowSeatWithLayout extends ShowSeat {
  row: string;
  number: number;
  seat_label: string;
  tier: SeatTier;
}

