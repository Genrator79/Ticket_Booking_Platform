export interface SeatHold {
  holdId: string;
  userId: string;
  showId: string;
  showSeatIds: string[];
  seatLabels: string[];
  totalAmount: number;
  expiresAt: string;
  expiresInSeconds: number;
  status: 'HELD' | 'EXPIRED' | 'RELEASED' | 'CONFIRMED';
  createdAt: string;
}

export interface CreateHoldPayload {
  show_id: string;
  show_seat_ids: string[];
  ttl_seconds?: number;
}
