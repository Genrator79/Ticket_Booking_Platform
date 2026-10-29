export type UserRole = 'customer' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

export type SafeUser = Omit<User, 'password_hash'>;

export interface CreateUserData {
  name: string;
  email: string;
  password_hash: string;
  role?: UserRole;
}

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}
