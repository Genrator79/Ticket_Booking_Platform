import { z } from 'zod';

export const createBookingSchema = z.object({
  show_id: z.string().uuid('Invalid show UUID'),
  show_seat_ids: z
    .array(z.string().uuid('Invalid show_seat UUID'))
    .min(1, 'At least one seat must be selected')
    .max(10, 'Cannot book more than 10 seats at once'),
});

export type CreateBookingSchema = z.infer<typeof createBookingSchema>;

