import api from './api';
import type { ApiResponse } from '../types/api';
import type { AuthResponse, LoginCredentials, RegisterCredentials, User } from '../types/auth';

export const authService = {
  /**
   * Registers a new user account and saves session token.
   */
  async register(credentials: RegisterCredentials): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/register', credentials);
    if (!response.data.data) {
      throw new Error(response.data.message || 'Registration failed');
    }
    const { user, token } = response.data.data;
    this.setSession(token, user);
    return { user, token };
  },

  /**
   * Authenticates user credentials and saves session token.
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<ApiResponse<AuthResponse>>('/auth/login', credentials);
    if (!response.data.data) {
      throw new Error(response.data.message || 'Login failed');
    }
    const { user, token } = response.data.data;
    this.setSession(token, user);
    return { user, token };
  },

  /**
   * Fetches profile of currently authenticated user.
   */
  async getMe(): Promise<User> {
    const response = await api.get<ApiResponse<{ user: User }>>('/auth/me');
    if (!response.data.data?.user) {
      throw new Error('Failed to retrieve user profile');
    }
    return response.data.data.user;
  },

  /**
   * Retrieves active token from local storage.
   */
  getToken(): string | null {
    return localStorage.getItem('token');
  },

  /**
   * Persists authentication token and user cache.
   */
  setSession(token: string, user: User): void {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  },

  /**
   * Retrieves cached user object from local storage.
   */
  getCachedUser(): User | null {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  /**
   * Clears auth session.
   */
  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },
};
