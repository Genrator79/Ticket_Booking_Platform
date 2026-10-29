import api from './api';
import type { ApiResponse } from '../types/api';
import type { Show, ShowSeatsResponse } from '../types/catalog';

export const showService = {
  async getShows(filters?: { movieId?: string; date?: string }): Promise<Show[]> {
    const params: Record<string, string> = {};
    if (filters?.movieId) params.movieId = filters.movieId;
    if (filters?.date) params.date = filters.date;

    const res = await api.get<ApiResponse<Show[]>>('/shows', { params });
    return res.data.data || [];
  },

  async getShowById(id: string): Promise<Show> {
    const res = await api.get<ApiResponse<Show>>(`/shows/${id}`);
    if (!res.data.data) {
      throw new Error(res.data.message || 'Show not found');
    }
    return res.data.data;
  },

  async getShowSeats(showId: string): Promise<ShowSeatsResponse> {
    const res = await api.get<ApiResponse<ShowSeatsResponse>>(`/shows/${showId}/seats`);
    if (!res.data.data) {
      throw new Error(res.data.message || 'Show seats layout not found');
    }
    return res.data.data;
  },
};

