import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { closePool, query } from '../src/db/index';
import { env } from '../src/config/env';

describe('Authentication & Security Integration Tests (M03)', () => {
  const app = createApp();

  const testUser = {
    name: 'Alice Developer',
    email: 'alice.test@example.com',
    password: 'Password123!',
  };

  beforeAll(async () => {
    // Clean up test user if already exists from prior runs
    await query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [testUser.email]);
  });

  afterAll(async () => {
    // Clean up test user and close DB pool
    await query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [testUser.email]);
    await closePool();
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user successfully and return JWT and user profile', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.data).toBeDefined();

      const { user, token } = res.body.data;
      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.name).toBe(testUser.name);
      expect(user.email).toBe(testUser.email.toLowerCase());
      expect(user.role).toBe('customer');

      // Security check: password_hash must never be leaked in API response
      expect(user.password_hash).toBeUndefined();

      // Token check
      expect(typeof token).toBe('string');
      const decoded = jwt.verify(token, env.JWT_SECRET) as any;
      expect(decoded.userId).toBe(user.id);
      expect(decoded.email).toBe(user.email);
      expect(decoded.role).toBe('customer');

      // Database check: verify password was hashed with bcrypt
      const dbRecord = await query<{ password_hash: string }>(
        'SELECT password_hash FROM users WHERE id = $1',
        [user.id]
      );
      expect(dbRecord.rows.length).toBe(1);
      const hash = dbRecord.rows[0].password_hash;
      expect(hash).not.toBe(testUser.password);
      expect(await bcrypt.compare(testUser.password, hash)).toBe(true);
    });

    it('should reject registration if email is already registered (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject registration with invalid email (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Invalid Email',
          email: 'not-an-email',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject registration with short password (< 8 chars) (400 Bad Request)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Password',
          email: 'shortpass@example.com',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    it('should authenticate user with valid credentials and return JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Login successful');
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.data.token).toBeDefined();
    });

    it('should handle case-insensitive email comparison on login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email.toUpperCase(),
          password: testUser.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
    });

    it('should reject login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword999',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });
  });

  describe('GET /api/auth/me (Protected Route)', () => {
    let authToken = '';

    beforeAll(async () => {
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      authToken = loginRes.body.data.token;
    });

    it('should return authenticated user profile when valid Bearer token provided', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe(testUser.email.toLowerCase());
      expect(res.body.data.user.password_hash).toBeUndefined();
    });

    it('should reject request without Authorization header (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token missing/i);
    });

    it('should reject request with invalid/tampered token (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.signature');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid or expired/i);
    });

    it('should reject request with malformed authorization header (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Basic 123456');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/token missing or malformed/i);
    });
  });
});

