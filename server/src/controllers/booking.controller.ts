import { Request, Response, NextFunction } from 'express';
import { bookingService } from '../services/booking.service.js';
import { UnauthorizedError } from '../utils/errors.js';

export class BookingController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to create a booking');
      }

      const booking = await bookingService.createBooking(req.user.userId, req.body);

      res.status(201).json({
        success: true,
        message: 'Booking confirmed successfully',
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyBookings(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to view bookings');
      }

      const bookings = await bookingService.getUserBookings(req.user.userId);

      res.status(200).json({
        success: true,
        data: bookings,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        throw new UnauthorizedError('Authentication required to view booking');
      }

      const { id } = req.params;
      const booking = await bookingService.getBookingById(id, req.user);

      res.status(200).json({
        success: true,
        data: booking,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const bookingController = new BookingController();
