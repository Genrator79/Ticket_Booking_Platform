import api from './api';
import type { ApiResponse } from '../types/api';
import type { PaymentReceipt, ProcessPaymentPayload, RefundPayload } from '../types/payment';

export const paymentService = {
  /**
   * Processes a simulated payment charge for an active hold or booking.
   * Sends an Idempotency-Key header to prevent duplicate charges upon retries.
   */
  async processPayment(
    payload: ProcessPaymentPayload,
    idempotencyKey?: string
  ): Promise<PaymentReceipt> {
    const key = idempotencyKey || payload.idempotency_key;
    const headers = key ? { 'Idempotency-Key': key } : undefined;
    const res = await api.post<ApiResponse<PaymentReceipt>>('/payments/process', payload, {
      headers,
    });
    return res.data.data!;
  },

  /**
   * Retrieves payment transaction receipt by ID.
   */
  async getPayment(paymentId: string): Promise<PaymentReceipt> {
    const res = await api.get<ApiResponse<PaymentReceipt>>(`/payments/${paymentId}`);
    return res.data.data!;
  },

  /**
   * Refunds a previously successful transaction.
   */
  async refundPayment(paymentId: string, payload?: RefundPayload): Promise<PaymentReceipt> {
    const res = await api.post<ApiResponse<PaymentReceipt>>(`/payments/${paymentId}/refund`, payload);
    return res.data.data!;
  },
};

