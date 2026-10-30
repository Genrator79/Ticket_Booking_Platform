import { getRedisClient } from './index.js';

export class RedisService {
  private get client() {
    return getRedisClient();
  }

  /**
   * Retrieves string value for key
   */
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  /**
   * Retrieves parsed JSON value for key
   */
  async getJSON<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Sets string value with optional TTL in seconds
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Serializes and sets JSON value with optional TTL in seconds
   */
  async setJSON<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    await this.set(key, serialized, ttlSeconds);
  }

  /**
   * Atomic Set-if-Not-Exists (SETNX) with optional TTL in seconds.
   * Crucial building block for distributed locking and temporary seat holds.
   * Returns true if the key was set, false if the key already exists.
   */
  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    let result: string | null;
    if (ttlSeconds !== undefined && ttlSeconds > 0) {
      result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    } else {
      result = await this.client.set(key, value, 'NX');
    }
    return result === 'OK';
  }

  /**
   * Deletes one or more keys
   */
  async del(key: string | string[]): Promise<number> {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length === 0) return 0;
    return this.client.del(...keys);
  }

  /**
   * Checks if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  /**
   * Gets remaining time-to-live in seconds
   * Returns -2 if key does not exist, -1 if key exists with no expire
   */
  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  /**
   * Sets expiration on an existing key in seconds
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.client.expire(key, ttlSeconds);
    return result === 1;
  }

  /**
   * Increments integer value by 1
   */
  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  /**
   * Increments integer value by specified amount
   */
  async incrBy(key: string, increment: number): Promise<number> {
    return this.client.incrby(key, increment);
  }

  /**
   * Returns keys matching pattern
   */
  async keys(pattern: string): Promise<string[]> {
    return this.client.keys(pattern);
  }

  /**
   * Flushes all keys (primarily for test environments)
   */
  async flushAll(): Promise<void> {
    await this.client.flushall();
  }
}

export const redisService = new RedisService();
