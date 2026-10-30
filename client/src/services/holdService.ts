import api from './api';
import type { ApiResponse } from '../types/api';
import type { SeatHold, CreateHoldPayload } from '../types/hold';

export const holdService = {
  /**
   * Places a temporary hold on the selected seats.
   */
  async createHold(payload: CreateHoldPayload): Promise<SeatHold> {
    const res = await api.post<ApiResponse<SeatHold>>('/holds', payload);
    return res.data.data!;
  },

  /**
   * Fetches the current status and remaining time for an active hold.
   */
  async getHold(holdId: string): Promise<SeatHold> {
    const res = await api.get<ApiResponse<SeatHold>>(`/holds/${holdId}`);
    return res.data.data!;
  },

  /**
   * Releases an active hold so seats are returned to the pool immediately.
   */
  async releaseHold(holdId: string): Promise<void> {
    await api.delete<ApiResponse<null>>(`/holds/${holdId}`);
  },
};

