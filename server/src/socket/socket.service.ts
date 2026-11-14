import { getIO } from './index.js';
import type {
  SeatHeldEventPayload,
  SeatReleasedEventPayload,
  SeatBookedEventPayload,
} from '../types/socket.js';

export class SocketService {
  /**
   * Broadcast that seats have been held in a show.
   */
  public emitSeatHeld(
    showId: string,
    seatIds: string[],
    heldByUserId: string,
    expiresAt: Date | string
  ): void {
    try {
      const io = getIO();
      const payload: SeatHeldEventPayload = {
        showId,
        seatIds,
        heldByUserId,
        expiresAt: typeof expiresAt === 'string' ? expiresAt : expiresAt.toISOString(),
      };
      io.to(`show:${showId}`).emit('seat:held', payload);
    } catch {
      // Gracefully ignore if Socket.IO is not initialized (e.g. running in isolated test environments)
    }
  }

  /**
   * Broadcast that seats have been released (hold expired, cancelled, or payment failed).
   */
  public emitSeatReleased(
    showId: string,
    seatIds: string[],
    reason: 'manual' | 'expired' | 'payment_failed' | 'payment_declined' = 'manual'
  ): void {
    try {
      const io = getIO();
      const payload: SeatReleasedEventPayload = {
        showId,
        seatIds,
        reason,
      };
      io.to(`show:${showId}`).emit('seat:released', payload);
    } catch {
      // Gracefully ignore if Socket.IO is not initialized
    }
  }

  /**
   * Broadcast that seats have been booked and permanently confirmed.
   */
  public emitSeatBooked(
    showId: string,
    seatIds: string[],
    bookingId: string
  ): void {
    try {
      const io = getIO();
      const payload: SeatBookedEventPayload = {
        showId,
        seatIds,
        bookingId,
      };
      io.to(`show:${showId}`).emit('seat:booked', payload);
    } catch {
      // Gracefully ignore if Socket.IO is not initialized
    }
  }
}

export const socketService = new SocketService();
