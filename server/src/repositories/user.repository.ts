import { query } from '../db/index.js';
import { CreateUserData, User } from '../types/user.js';

/**
 * Encapsulates all PostgreSQL data access operations for the User entity.
 * Follows Repository Pattern (SRP) to decouple business logic from SQL statements.
 */
export class UserRepository {
  /**
   * Retrieves a user by their unique email address.
   * Uses parameterized queries to prevent SQL injection.
   */
  async findByEmail(email: string): Promise<User | null> {
    const text = `
      SELECT id, name, email, password_hash, role, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
    `;
    const result = await query<User>(text, [email]);
    return result.rows[0] || null;
  }

  /**
   * Retrieves a user by their UUID primary key.
   */
  async findById(id: string): Promise<User | null> {
    const text = `
      SELECT id, name, email, password_hash, role, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1
    `;
    const result = await query<User>(text, [id]);
    return result.rows[0] || null;
  }

  /**
   * Inserts a new user record into PostgreSQL.
   */
  async create(userData: CreateUserData): Promise<User> {
    const text = `
      INSERT INTO users (name, email, password_hash, role)
      VALUES ($1, LOWER($2), $3, $4)
      RETURNING id, name, email, password_hash, role, created_at, updated_at
    `;
    const values = [
      userData.name,
      userData.email,
      userData.password_hash,
      userData.role || 'customer',
    ];
    const result = await query<User>(text, values);
    return result.rows[0];
  }
}

export const userRepository = new UserRepository();
