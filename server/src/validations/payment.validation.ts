import { z } from 'zod';

export const processPaymentSchema = z
  .object({
    hold_id: z.string().uuid('Invalid hold UUID format').optional(),
    booking_id: z.string().uuid('Invalid booking UUID format').optional(),
    payment_method: z.string().min(1).default('CREDIT_CARD').optional(),
    card_token: z.string().optional(),
    idempotency_key: z.string().optional(),
  })
  .refine((data) => Boolean(data.hold_id || data.booking_id), {
    message: 'Either hold_id or booking_id must be provided to process payment',
  });

export const paymentIdParamSchema = z.object({
  id: z.string().uuid('Invalid payment UUID format'),
});

export const bookingIdParamSchema = z.object({
  bookingId: z.string().uuid('Invalid booking UUID format'),
});

export const refundPaymentSchema = z.object({
  reason: z.string().max(255).optional(),
});

