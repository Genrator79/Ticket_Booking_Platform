import crypto from 'crypto';
import { redisService } from '../redis/redis.service.js';
import {
  IdempotencyRepository,
  idempotencyRepository,
} from '../repositories/idempotency.repository.js';
import { CachedIdempotentResponse } from '../types/idempotency.js';

export class IdempotencyService {
  constructor(private repo: IdempotencyRepository = idempotencyRepository) {}

  private getLockKey(userId: string, key: string): string {
    return `idemp:lock:${userId}:${key}`;
  }

  private getResponseKey(userId: string, key: string): string {
    return `idemp:resp:${userId}:${key}`;
  }

  /**
   * Deterministically canonicalizes an object to guarantee uniform hash regardless of property order.
   */
  canonicalize(value: any): any {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.canonicalize(v));
    }
    const sortedKeys = Object.keys(value).sort();
    const result: Record<string, any> = {};
    for (const k of sortedKeys) {
      result[k] = this.canonicalize(value[k]);
    }
    return result;
  }

  /**
   * Computes a SHA-256 fingerprint for request path and body.
   */
  computeHash(path: string, method: string, body: any): string {
    const canonicalBody = this.canonicalize(body || {});
    const serialized = `${method.toUpperCase()}:${path}:${JSON.stringify(canonicalBody)}`;
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Acquires an in-flight distributed lock for the idempotency key using Redis SETNX.
   * Returns true if lock was successfully acquired, false if a request with this key is already in-flight.
   */
  async acquireLock(userId: string, key: string, ttlSeconds = 60): Promise<boolean> {
    const lockKey = this.getLockKey(userId, key);
    return redisService.setNX(lockKey, 'IN_PROGRESS', ttlSeconds);
  }

  /**
   * Releases the in-flight distributed lock.
   */
  async releaseLock(userId: string, key: string): Promise<void> {
    const lockKey = this.getLockKey(userId, key);
    await redisService.del(lockKey);
  }

  /**
   * Retrieves a cached response from Redis fast tier, with fallback to PostgreSQL.
   */
  async getCachedResponse(
    userId: string,
    key: string
  ): Promise<CachedIdempotentResponse | null> {
    const respKey = this.getResponseKey(userId, key);

    // 1. Check Redis in-memory fast tier
    const cached = await redisService.getJSON<CachedIdempotentResponse>(respKey);
    if (cached) {
      return cached;
    }

    // 2. Fallback to PostgreSQL durable record
    const dbRecord = await this.repo.findByKey(userId, key);
    if (dbRecord) {
      const response: CachedIdempotentResponse = {
        statusCode: dbRecord.status_code,
        body: dbRecord.response_body,
        paramsHash: dbRecord.request_params_hash,
        createdAt: dbRecord.created_at.toISOString(),
      };
      // Backfill Redis cache with 24-hour TTL
      await redisService.setJSON(respKey, response, 86400).catch(() => {});
      return response;
    }

    return null;
  }

  /**
   * Caches an executed response in both Redis (fast tier) and PostgreSQL (durable audit tier).
   */
  async saveResponse(
    userId: string,
    key: string,
    path: string,
    paramsHash: string,
    statusCode: number,
    body: any,
    ttlSeconds = 86400
  ): Promise<void> {
    const respKey = this.getResponseKey(userId, key);

    const record: CachedIdempotentResponse = {
      statusCode,
      body,
      paramsHash,
      createdAt: new Date().toISOString(),
    };

    // Save in Redis fast tier
    await redisService.setJSON(respKey, record, ttlSeconds);

    // Save in PostgreSQL durable tier asynchronously
    this.repo
      .create({
        key,
        userId,
        requestPath: path,
        requestParamsHash: paramsHash,
        statusCode,
        responseBody: body,
      })
      .catch((err) => {
        console.error('[Idempotency DB Save Error]:', err.message);
      });
  }
}

export const idempotencyService = new IdempotencyService();

