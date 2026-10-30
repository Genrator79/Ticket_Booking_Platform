import { withTransaction } from '../db/index.js';
import { mockPaymentProvider } from '../providers/payment/mock.provider.js';
import { PaymentProvider } from '../providers/payment/payment.provider.js';
import { BookingRepository, bookingRepository } from '../repositories/booking.repository.js';
import { PaymentRepository, paymentRepository } from '../repositories/payment.repository.js';
import { Payment, PaymentReceipt, ProcessPaymentDTO, RefundPaymentDTO } from '../types/payment.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { holdService, HoldService } from './hold.service.js';

export class PaymentService {
  constructor(
    private paymentRepo: PaymentRepository = paymentRepository,
    private bookingRepo: BookingRepository = bookingRepository,
    private holdSvc: HoldService = holdService,
    private provider: PaymentProvider = mockPaymentProvider
  ) {}

  /**
   * Processes a payment charge for an active temporary hold or an existing booking.
   * Adheres to OCP & LSP by delegating gateway communication to the injected PaymentProvider.
   */
  async processPayment(userId: string, input: ProcessPaymentDTO): Promise<PaymentReceipt> {
    const { hold_id, booking_id, payment_method, card_token, idempotency_key } = input;

    if (!hold_id && !booking_id) {
      throw new BadRequestError('Either hold_id or booking_id must be provided to process payment');
    }

    let targetBookingId = booking_id;
    let totalAmount = 0;
    let seatIds: string[] = [];

    // Path 1: Process payment directly from an active temporary hold
    if (hold_id) {
      const activeHold = await this.holdSvc.getHold(hold_id, userId);
      totalAmount = activeHold.totalAmount;
      seatIds = activeHold.showSeatIds;

      // Atomically create a PENDING booking in PostgreSQL before charging
      const pendingBooking = await withTransaction(async (client) => {
        const seats = await this.bookingRepo.getShowSeatsForUpdate(client, seatIds);

        for (const seat of seats) {
          if (seat.status === 'BOOKED') {
            throw new ConflictError(`Seat ${seat.seat_label} is already permanently booked`);
          }
        }

        const b = await this.bookingRepo.createBookingRecord(client, {
          user_id: userId,
          show_id: activeHold.showId,
          total_amount: totalAmount,
          status: 'PENDING',
        });

        const seatItems = seats.map((s) => ({
          show_seat_id: s.id,
          price: Number(s.price),
        }));
        await this.bookingRepo.createBookingSeats(client, b.id, seatItems);

        // Mark seats as HELD in DB while payment is in-flight
        await this.bookingRepo.updateShowSeatsStatus(client, seatIds, 'HELD');

        return b;
      });

      targetBookingId = pendingBooking.id;
    } else if (booking_id) {
      // Path 2: Process payment for an existing booking
      const existing = await this.bookingRepo.findById(booking_id);
      if (!existing) {
        throw new NotFoundError(`Booking with ID ${booking_id} not found`);
      }

      if (existing.user_id !== userId) {
        throw new ForbiddenError('You do not have permission to pay for this booking');
      }

      if (existing.status === 'CONFIRMED') {
        throw new ConflictError('This booking is already confirmed and paid');
      }

      if (existing.status === 'CANCELLED') {
        throw new ConflictError('Cannot process payment for a cancelled booking');
      }

      totalAmount = Number(existing.total_amount);
      seatIds = existing.seats.map((s) => s.show_seat_id);
    }

    // 1. Create PENDING payment record
    const paymentRecord = await this.paymentRepo.create({
      booking_id: targetBookingId!,
      amount: totalAmount,
      status: 'PENDING',
      provider: this.provider.name,
      idempotency_key: idempotency_key || null,
    });

    // 2. Execute charge against PaymentProvider
    const chargeResult = await this.provider.charge({
      amount: totalAmount,
      description: `Payment for Booking #${targetBookingId}`,
      paymentMethod: payment_method || 'CREDIT_CARD',
      cardToken: card_token,
      idempotencyKey: idempotency_key,
      metadata: { bookingId: targetBookingId, userId },
    });

    // 3. Handle Payment Outcome
    if (chargeResult.success) {
      // SUCCESS: Finalize booking, transition show_seats to BOOKED, release Redis holds
      await withTransaction(async (client) => {
        await this.paymentRepo.updateStatus(paymentRecord.id, 'SUCCESS', client);
        await this.paymentRepo.updateTransactionReference(
          paymentRecord.id,
          chargeResult.transactionReference,
          client
        );
        await this.bookingRepo.updateBookingStatus(targetBookingId!, 'CONFIRMED', client);
        await this.bookingRepo.updateShowSeatsStatus(client, seatIds, 'BOOKED');
      });

      if (hold_id) {
        await this.holdSvc.releaseHold(hold_id, userId).catch(() => {});
      }

      return {
        paymentId: paymentRecord.id,
        bookingId: targetBookingId!,
        amount: totalAmount,
        status: 'SUCCESS',
        provider: this.provider.name,
        transactionReference: chargeResult.transactionReference,
        createdAt: paymentRecord.created_at.toISOString(),
      };
    } else {
      // FAILURE: Transition payment & booking to FAILED, release seats back to AVAILABLE
      await withTransaction(async (client) => {
        await this.paymentRepo.updateStatus(paymentRecord.id, 'FAILED', client);
        await this.paymentRepo.updateTransactionReference(
          paymentRecord.id,
          chargeResult.transactionReference,
          client
        );
        await this.bookingRepo.updateBookingStatus(targetBookingId!, 'FAILED', client);
        await this.bookingRepo.updateShowSeatsStatus(client, seatIds, 'AVAILABLE');
      });

      if (hold_id) {
        await this.holdSvc.releaseHold(hold_id, userId).catch(() => {});
      }

      return {
        paymentId: paymentRecord.id,
        bookingId: targetBookingId!,
        amount: totalAmount,
        status: 'FAILED',
        provider: this.provider.name,
        transactionReference: chargeResult.transactionReference,
        failureReason: chargeResult.failureReason,
        createdAt: paymentRecord.created_at.toISOString(),
      };
    }
  }

  /**
   * Processes a refund for an existing successful payment.
   */
  async processRefund(
    paymentId: string,
    requestingUser: { userId: string; role: string },
    dto?: RefundPaymentDTO
  ): Promise<PaymentReceipt> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment with ID ${paymentId} not found`);
    }

    if (payment.status !== 'SUCCESS') {
      throw new BadRequestError(`Cannot refund a payment with status ${payment.status}`);
    }

    const booking = await this.bookingRepo.findById(payment.booking_id);
    if (!booking) {
      throw new NotFoundError(`Associated booking ${payment.booking_id} not found`);
    }

    if (requestingUser.role !== 'admin' && booking.user_id !== requestingUser.userId) {
      throw new ForbiddenError('You do not have permission to refund this payment');
    }

    // Call payment provider refund
    const refundResult = await this.provider.refund({
      transactionReference: payment.transaction_reference!,
      amount: Number(payment.amount),
      reason: dto?.reason,
    });

    if (!refundResult.success) {
      throw new BadRequestError(`Refund failed: ${refundResult.failureReason}`);
    }

    // Atomically transition payment to REFUNDED, booking to CANCELLED, and seats to AVAILABLE
    const seatIds = booking.seats.map((s) => s.show_seat_id);
    await withTransaction(async (client) => {
      await this.paymentRepo.updateStatus(payment.id, 'REFUNDED', client);
      await this.bookingRepo.updateBookingStatus(booking.id, 'CANCELLED', client);
      await this.bookingRepo.updateShowSeatsStatus(client, seatIds, 'AVAILABLE');
    });

    return {
      paymentId: payment.id,
      bookingId: booking.id,
      amount: Number(payment.amount),
      status: 'REFUNDED',
      provider: payment.provider,
      transactionReference: refundResult.refundReference,
      createdAt: payment.created_at.toISOString(),
    };
  }

  /**
   * Retrieves payment details by ID with authorization verification.
   */
  async getPaymentById(
    paymentId: string,
    requestingUser: { userId: string; role: string }
  ): Promise<PaymentReceipt> {
    const payment = await this.paymentRepo.findById(paymentId);
    if (!payment) {
      throw new NotFoundError(`Payment with ID ${paymentId} not found`);
    }

    const booking = await this.bookingRepo.findById(payment.booking_id);
    if (!booking) {
      throw new NotFoundError('Associated booking record not found');
    }

    if (requestingUser.role !== 'admin' && booking.user_id !== requestingUser.userId) {
      throw new ForbiddenError('You do not have permission to view this payment');
    }

    return {
      paymentId: payment.id,
      bookingId: booking.id,
      amount: Number(payment.amount),
      status: payment.status,
      provider: payment.provider,
      transactionReference: payment.transaction_reference,
      createdAt: payment.created_at.toISOString(),
    };
  }

  /**
   * Retrieves all payments for a specific booking.
   */
  async getPaymentsByBookingId(
    bookingId: string,
    requestingUser: { userId: string; role: string }
  ): Promise<PaymentReceipt[]> {
    const booking = await this.bookingRepo.findById(bookingId);
    if (!booking) {
      throw new NotFoundError(`Booking with ID ${bookingId} not found`);
    }

    if (requestingUser.role !== 'admin' && booking.user_id !== requestingUser.userId) {
      throw new ForbiddenError('You do not have permission to view payments for this booking');
    }

    const payments = await this.paymentRepo.findByBookingId(bookingId);
    return payments.map((p) => ({
      paymentId: p.id,
      bookingId: p.booking_id,
      amount: Number(p.amount),
      status: p.status,
      provider: p.provider,
      transactionReference: p.transaction_reference,
      createdAt: p.created_at.toISOString(),
    }));
  }

  /**
   * Simulates processing incoming webhook events from a payment gateway.
   */
  async handleWebhook(payload: any, signature?: string): Promise<{ received: boolean; event: string }> {
    if (this.provider.verifyWebhookSignature && signature) {
      const valid = this.provider.verifyWebhookSignature(JSON.stringify(payload), signature);
      if (!valid) {
        throw new BadRequestError('Invalid webhook signature');
      }
    }

    const { event, data } = payload;
    if (event === 'payment.succeeded' && data?.transaction_reference) {
      const payment = await this.paymentRepo.findByTransactionReference(data.transaction_reference);
      if (payment && payment.status === 'PENDING') {
        await withTransaction(async (client) => {
          await this.paymentRepo.updateStatus(payment.id, 'SUCCESS', client);
          await this.bookingRepo.updateBookingStatus(payment.booking_id, 'CONFIRMED', client);
          const booking = await this.bookingRepo.findById(payment.booking_id);
          if (booking) {
            const seatIds = booking.seats.map((s) => s.show_seat_id);
            await this.bookingRepo.updateShowSeatsStatus(client, seatIds, 'BOOKED');
          }
        });
      }
    }

    return { received: true, event: event || 'unknown' };
  }
}

export const paymentService = new PaymentService();
