import { z } from 'zod';

export const createBookingSchema = z
  .object({
    hold_id: z.string().uuid('Invalid hold UUID').optional(),
    show_id: z.string().uuid('Invalid show UUID').optional(),
    show_seat_ids: z
      .array(z.string().uuid('Invalid show_seat UUID'))
      .min(1, 'At least one seat must be selected')
      .max(10, 'Cannot book more than 10 seats at once')
      .optional(),
  })
  .refine(
    (data) => Boolean(data.hold_id || (data.show_id && data.show_seat_ids && data.show_seat_ids.length > 0)),
    {
      message: 'Either hold_id or both show_id and show_seat_ids must be provided',
    }
  );

export type CreateBookingSchema = z.infer<typeof createBookingSchema>;

