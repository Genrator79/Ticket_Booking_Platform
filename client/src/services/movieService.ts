import api from './api';
import type { ApiResponse } from '../types/api';
import type { Movie } from '../types/catalog';

export const movieService = {
  async getMovies(filters?: { genre?: string; search?: string }): Promise<Movie[]> {
    const params: Record<string, string> = {};
    if (filters?.genre) params.genre = filters.genre;
    if (filters?.search) params.search = filters.search;

    const res = await api.get<ApiResponse<Movie[]>>('/movies', { params });
    return res.data.data || [];
  },

  async getMovieById(id: string): Promise<Movie> {
    const res = await api.get<ApiResponse<Movie>>(`/movies/${id}`);
    if (!res.data.data) {
      throw new Error(res.data.message || 'Movie not found');
    }
    return res.data.data;
  },
};

