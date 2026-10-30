export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface Payment {
  id: string;
  booking_id: string;
  amount: string | number;
  status: PaymentStatus;
  provider: string;
  transaction_reference: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePaymentRecordDTO {
  booking_id: string;
  amount: number;
  status?: PaymentStatus;
  provider?: string;
  transaction_reference?: string | null;
  idempotency_key?: string | null;
}

export interface ProcessPaymentDTO {
  hold_id?: string;
  booking_id?: string;
  payment_method?: string;
  card_token?: string; // e.g. "tok_success", "tok_decline", "tok_timeout"
  idempotency_key?: string;
}

export interface RefundPaymentDTO {
  reason?: string;
}

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

