import { z } from 'zod';

export const createMovieSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  duration_minutes: z.number().int().positive('Duration must be positive in minutes'),
  genre: z.string().trim().min(1, 'Genre is required').max(100),
  rating: z.string().optional(),
  poster_url: z.string().url('Invalid poster URL').optional().or(z.literal('')),
  release_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Release date must be YYYY-MM-DD').optional(),
});

export const updateMovieSchema = createMovieSchema.partial();

export const createVenueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required').max(255),
  city: z.string().trim().min(1, 'City is required').max(100),
  address: z.string().trim().min(1, 'Address is required'),
});

export const createScreenSchema = z.object({
  name: z.string().trim().min(1, 'Screen name is required').max(100),
  total_seats: z.number().int().nonnegative().optional(),
});

export const createShowSchema = z.object({
  movie_id: z.string().uuid('Invalid movie UUID'),
  screen_id: z.string().uuid('Invalid screen UUID'),
  start_time: z.string().datetime({ message: 'Invalid start_time ISO timestamp' }),
  end_time: z.string().datetime({ message: 'Invalid end_time ISO timestamp' }),
  base_price: z.number().positive('Base price must be greater than 0'),
});

