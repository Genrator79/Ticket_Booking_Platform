import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserRepository, userRepository } from '../repositories/user.repository.js';
import { AuthTokenPayload, SafeUser, User } from '../types/user.js';
import { ConflictError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

export interface RegisterDTO {
  name: string;
  email: string;
  password: string;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface AuthResult {
  user: SafeUser;
  token: string;
}

/**
 * Service encapsulating authentication and identity management business rules.
 * Handles password hashing, verification, token generation, and user lifecycle.
 */
export class AuthService {
  private userRepo: UserRepository;
  private saltRounds = 10;

  constructor(userRepo: UserRepository = userRepository) {
    this.userRepo = userRepo;
  }

  /**
   * Strips sensitive properties such as password_hash from the user record.
   */
  private toSafeUser(user: User): SafeUser {
    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Signs a JSON Web Token with the authenticated user's claims.
   */
  public generateToken(payload: AuthTokenPayload): string {
    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  /**
   * Verifies and decodes a signed JWT.
   */
  public verifyToken(token: string): AuthTokenPayload {
    try {
      return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired authentication token');
    }
  }

  /**
   * Registers a new user account.
   * Throws ConflictError if email is already in use.
   */
  async register(data: RegisterDTO): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(data.email);
    if (existing) {
      throw new ConflictError('An account with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, this.saltRounds);
    const user = await this.userRepo.create({
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      password_hash: passwordHash,
      role: 'customer',
    });

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.toSafeUser(user),
      token,
    };
  }

  /**
   * Authenticates user credentials and issues a signed JWT.
   * Throws UnauthorizedError with a generic message to prevent user enumeration attacks.
   */
  async login(credentials: LoginDTO): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(credentials.email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(credentials.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const token = this.generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: this.toSafeUser(user),
      token,
    };
  }

  /**
   * Retrieves profile details for the authenticated user by ID.
   */
  async getCurrentUser(userId: string): Promise<SafeUser> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User profile not found');
    }
    return this.toSafeUser(user);
  }
}

export const authService = new AuthService();
