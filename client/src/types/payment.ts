export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface PaymentReceipt {
  paymentId: string;
  bookingId: string;
  amount: number;
  status: PaymentStatus;
  provider: string;
  transactionReference: string | null;
  failureReason?: string;
  createdAt: string;
}

export interface ProcessPaymentPayload {
  hold_id?: string;
  booking_id?: string;
  payment_method?: string;
  card_token?: string;
  idempotency_key?: string;
}

export interface RefundPayload {
  reason?: string;
}
