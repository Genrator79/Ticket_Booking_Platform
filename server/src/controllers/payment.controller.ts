import { Request, Response } from 'express';
import { paymentService } from '../services/payment.service.js';

export class PaymentController {
  async processPayment(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const receipt = await paymentService.processPayment(userId, req.body);

    const isSuccess = receipt.status === 'SUCCESS';
    res.status(isSuccess ? 200 : 402).json({
      success: isSuccess,
      message: isSuccess
        ? 'Payment processed and booking confirmed successfully'
        : `Payment failed: ${receipt.failureReason || 'Card declined'}`,
      data: receipt,
    });
  }

  async getPayment(req: Request, res: Response): Promise<void> {
    const user = { userId: req.user!.userId, role: req.user!.role };
    const receipt = await paymentService.getPaymentById(req.params.id, user);

    res.status(200).json({
      success: true,
      data: receipt,
    });
  }

  async getPaymentsByBooking(req: Request, res: Response): Promise<void> {
    const user = { userId: req.user!.userId, role: req.user!.role };
    const receipts = await paymentService.getPaymentsByBookingId(req.params.bookingId, user);

    res.status(200).json({
      success: true,
      data: receipts,
    });
  }

  async refundPayment(req: Request, res: Response): Promise<void> {
    const user = { userId: req.user!.userId, role: req.user!.role };
    const receipt = await paymentService.processRefund(req.params.id, user, req.body);

    res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
      data: receipt,
    });
  }

  async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['stripe-signature'] as string | undefined;
    const result = await paymentService.handleWebhook(req.body, signature);

    res.status(200).json({
      success: true,
      data: result,
    });
  }
}

export const paymentController = new PaymentController();
