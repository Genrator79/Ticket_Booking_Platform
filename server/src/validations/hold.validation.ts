import { z } from 'zod';

export const createHoldSchema = z.object({
  show_id: z.string().uuid('Invalid show ID format'),
  show_seat_ids: z
    .array(z.string().uuid('Invalid show seat ID format'))
    .min(1, 'At least one seat must be selected to hold')
    .max(10, 'Cannot hold more than 10 seats at once'),
  ttl_seconds: z.number().int().min(1).max(3600).optional(),
});

export const holdIdParamSchema = z.object({
  id: z.string().uuid('Invalid hold ID format'),
});

