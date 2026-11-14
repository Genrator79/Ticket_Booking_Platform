export interface SeatHeldEventPayload {
  showId: string;
  seatIds: string[];
  heldByUserId: string;
  expiresAt: string;
}

export interface SeatReleasedEventPayload {
  showId: string;
  seatIds: string[];
  reason?: 'manual' | 'expired' | 'payment_failed' | 'payment_declined';
}

export interface SeatBookedEventPayload {
  showId: string;
  seatIds: string[];
  bookingId: string;
}

export interface JoinShowPayload {
  showId: string;
}

export interface LeaveShowPayload {
  showId: string;
}

export interface ServerToClientEvents {
  'seat:held': (payload: SeatHeldEventPayload) => void;
  'seat:released': (payload: SeatReleasedEventPayload) => void;
  'seat:booked': (payload: SeatBookedEventPayload) => void;
  'joined:show': (payload: { showId: string; room: string }) => void;
  'left:show': (payload: { showId: string }) => void;
  'error': (payload: { message: string }) => void;
}

export interface ClientToServerEvents {
  'join:show': (payload: JoinShowPayload, callback?: (response: { success: boolean; room: string }) => void) => void;
  'leave:show': (payload: LeaveShowPayload, callback?: (response: { success: boolean }) => void) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string;
  email?: string;
  role?: string;
}

