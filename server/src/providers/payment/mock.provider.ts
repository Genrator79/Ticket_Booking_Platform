import crypto from 'crypto';
import {
  PaymentChargeRequest,
  PaymentChargeResult,
  PaymentProvider,
  PaymentRefundRequest,
  PaymentRefundResult,
} from './payment.provider.js';

export interface MockProviderOptions {
  simulatedDelayMs?: number;
  alwaysFail?: boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK_GATEWAY';

  constructor(private options: MockProviderOptions = {}) {}

  async charge(req: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const delay = this.options.simulatedDelayMs ?? 50;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const token = req.cardToken?.toLowerCase() || '';

    // 1. Force failure option or token-based failure simulations
    if (this.options.alwaysFail || token.includes('decline') || token.includes('fail')) {
      return {
        success: false,
        transactionReference: `txn_fail_${crypto.randomUUID()}`,
        status: 'FAILED',
        failureReason: 'Card was declined by issuing bank (Insufficient funds / card limit exceeded)',
        rawResponse: { code: 'card_declined', decline_code: 'insufficient_funds' },
      };
    }

    if (token.includes('timeout')) {
      return {
        success: false,
        transactionReference: `txn_timeout_${crypto.randomUUID()}`,
        status: 'FAILED',
        failureReason: 'Payment gateway timeout: upstream payment network did not respond in time',
        rawResponse: { code: 'gateway_timeout' },
      };
    }

    if (token.includes('fraud')) {
      return {
        success: false,
        transactionReference: `txn_fraud_${crypto.randomUUID()}`,
        status: 'FAILED',
        failureReason: 'Transaction blocked by automated risk and fraud detection rules',
        rawResponse: { code: 'fraudulent' },
      };
    }

    // 2. Default: Successful Authorization and Capture
    const transactionReference = `txn_mock_${crypto.randomUUID()}`;
    return {
      success: true,
      transactionReference,
      status: 'SUCCESS',
      rawResponse: {
        id: transactionReference,
        status: 'succeeded',
        amount: req.amount,
        currency: req.currency || 'USD',
        paid: true,
      },
    };
  }

  async refund(req: PaymentRefundRequest): Promise<PaymentRefundResult> {
    const delay = this.options.simulatedDelayMs ?? 20;
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (!req.transactionReference) {
      return {
        success: false,
        refundReference: '',
        status: 'FAILED',
        failureReason: 'Transaction reference is required for refunds',
      };
    }

    const refundReference = `ref_mock_${crypto.randomUUID()}`;
    return {
      success: true,
      refundReference,
      status: 'REFUNDED',
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!signature) return false;
    // Simple mock signature verification: matches sha256 or mock prefix
    const expected = crypto.createHash('sha256').update(payload).digest('hex');
    return signature === expected || signature.startsWith('mock_sig_');
  }
}

export const mockPaymentProvider = new MockPaymentProvider({
  simulatedDelayMs: process.env.NODE_ENV === 'test' ? 0 : 50,
});
