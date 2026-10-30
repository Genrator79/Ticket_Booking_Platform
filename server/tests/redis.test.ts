import { redisService } from '../src/redis/redis.service';
import { checkRedisConnection, closeRedis } from '../src/redis/index';

describe('M07 — Redis Infrastructure & Service Layer', () => {
  const TEST_PREFIX = 'test:m07:';

  beforeEach(async () => {
    // Clean up test keys before each test
    const keys = await redisService.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await redisService.del(keys);
    }
  });

  afterAll(async () => {
    // Clean up all remaining test keys and close connection
    const keys = await redisService.keys(`${TEST_PREFIX}*`);
    if (keys.length > 0) {
      await redisService.del(keys);
    }
    await closeRedis();
  });

  it('should verify live Redis connectivity via checkRedisConnection', async () => {
    const isConnected = await checkRedisConnection();
    expect(isConnected).toBe(true);
  });

  it('should set and get string keys correctly', async () => {
    const key = `${TEST_PREFIX}string`;
    await redisService.set(key, 'seatforge-rocks');

    const value = await redisService.get(key);
    expect(value).toBe('seatforge-rocks');

    const exists = await redisService.exists(key);
    expect(exists).toBe(true);
  });

  it('should store, retrieve, and deserialize JSON objects correctly', async () => {
    const key = `${TEST_PREFIX}json`;
    const payload = {
      holdId: 'hold-12345',
      showId: 'show-abc',
      seatIds: ['seat-1', 'seat-2'],
      totalPrice: 45.0,
      status: 'HELD',
    };

    await redisService.setJSON(key, payload);

    const retrieved = await redisService.getJSON<typeof payload>(key);
    expect(retrieved).not.toBeNull();
    expect(retrieved).toEqual(payload);
  });

  it('should return null when getting non-existent keys or invalid JSON', async () => {
    const missing = await redisService.get(`${TEST_PREFIX}nonexistent`);
    expect(missing).toBeNull();

    const missingJson = await redisService.getJSON(`${TEST_PREFIX}nonexistent`);
    expect(missingJson).toBeNull();

    // Invalid JSON string
    await redisService.set(`${TEST_PREFIX}invalid_json`, 'not-valid-json{');
    const parsedInvalid = await redisService.getJSON(`${TEST_PREFIX}invalid_json`);
    expect(parsedInvalid).toBeNull();
  });

  it('should enforce TTL on keys and return remaining TTL', async () => {
    const key = `${TEST_PREFIX}ttl`;
    await redisService.set(key, 'temporary-hold', 60);

    const remainingTtl = await redisService.ttl(key);
    expect(remainingTtl).toBeGreaterThan(0);
    expect(remainingTtl).toBeLessThanOrEqual(60);
  });

  it('should support atomic SETNX (Set-if-Not-Exists) for distributed locking and seat holds', async () => {
    const lockKey = `${TEST_PREFIX}lock:seat-A1`;

    // 1. First attempt to acquire lock must succeed
    const firstAcquire = await redisService.setNX(lockKey, 'user-1', 10);
    expect(firstAcquire).toBe(true);

    // 2. Second attempt by another user on the same key must fail
    const secondAcquire = await redisService.setNX(lockKey, 'user-2', 10);
    expect(secondAcquire).toBe(false);

    // Value should still belong to user-1
    const currentHolder = await redisService.get(lockKey);
    expect(currentHolder).toBe('user-1');

    // 3. Releasing lock via del allows subsequent acquisition
    await redisService.del(lockKey);

    const thirdAcquire = await redisService.setNX(lockKey, 'user-2', 10);
    expect(thirdAcquire).toBe(true);

    const newHolder = await redisService.get(lockKey);
    expect(newHolder).toBe('user-2');
  });

  it('should delete single and multiple keys and return deleted count', async () => {
    const key1 = `${TEST_PREFIX}k1`;
    const key2 = `${TEST_PREFIX}k2`;
    const key3 = `${TEST_PREFIX}k3`;

    await redisService.set(key1, 'val1');
    await redisService.set(key2, 'val2');
    await redisService.set(key3, 'val3');

    // Delete single key
    const deletedSingle = await redisService.del(key1);
    expect(deletedSingle).toBe(1);
    expect(await redisService.exists(key1)).toBe(false);

    // Delete multiple keys
    const deletedMultiple = await redisService.del([key2, key3]);
    expect(deletedMultiple).toBe(2);
    expect(await redisService.exists(key2)).toBe(false);
    expect(await redisService.exists(key3)).toBe(false);
  });

  it('should perform atomic increment operations (incr, incrBy)', async () => {
    const counterKey = `${TEST_PREFIX}counter`;

    const val1 = await redisService.incr(counterKey);
    expect(val1).toBe(1);

    const val2 = await redisService.incr(counterKey);
    expect(val2).toBe(2);

    const val5 = await redisService.incrBy(counterKey, 3);
    expect(val5).toBe(5);
  });

  it('should update TTL using expire method', async () => {
    const key = `${TEST_PREFIX}expire`;
    await redisService.set(key, 'persist-item');

    // Key has no initial TTL (-1)
    const initialTtl = await redisService.ttl(key);
    expect(initialTtl).toBe(-1);

    // Apply 30s TTL
    const updated = await redisService.expire(key, 30);
    expect(updated).toBe(true);

    const newTtl = await redisService.ttl(key);
    expect(newTtl).toBeGreaterThan(0);
    expect(newTtl).toBeLessThanOrEqual(30);
  });
});
