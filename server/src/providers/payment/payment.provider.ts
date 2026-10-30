export interface PaymentChargeRequest {
  amount: number;
  currency?: string;
  description: string;
  paymentMethod: string;
  cardToken?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface PaymentChargeResult {
  success: boolean;
  transactionReference: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  failureReason?: string;
  rawResponse?: Record<string, any>;
}

export interface PaymentRefundRequest {
  transactionReference: string;
  amount: number;
  reason?: string;
}

export interface PaymentRefundResult {
  success: boolean;
  refundReference: string;
  status: 'REFUNDED' | 'FAILED';
  failureReason?: string;
}

/**
 * Pluggable Payment Provider Interface (SOLID: OCP & LSP)
 * Allows seamless switching between Mock, Stripe, Razorpay, or Adyen implementations.
 */
export interface PaymentProvider {
  readonly name: string;

  /**
   * Authorizes and captures a payment charge
   */
  charge(req: PaymentChargeRequest): Promise<PaymentChargeResult>;

  /**
   * Refunds a previous successful transaction
   */
  refund(req: PaymentRefundRequest): Promise<PaymentRefundResult>;

  /**
   * Validates cryptographic webhook signature
   */
  verifyWebhookSignature?(payload: string, signature: string): boolean;
}
