import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redisInstance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisInstance) {
    redisInstance = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times: number) {
        if (env.NODE_ENV === 'test' && times > 2) {
          return null; // Stop retrying quickly during tests if down
        }
        const delay = Math.min(times * 100, 2000);
        return delay;
      },
    });

    redisInstance.on('connect', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('[Redis] Connected to Redis server.');
      }
    });

    redisInstance.on('ready', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('[Redis] Redis client is ready.');
      }
    });

    redisInstance.on('error', (err: Error) => {
      if (env.NODE_ENV !== 'test') {
        console.error('[Redis Error]', err.message);
      }
    });

    redisInstance.on('close', () => {
      if (env.NODE_ENV !== 'test') {
        console.log('[Redis] Connection closed.');
      }
    });
  }

  return redisInstance;
}

/**
 * Lazy proxy to access the Redis client without eager connection on module import
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisClient();
    const val = (client as any)[prop];
    return typeof val === 'function' ? val.bind(client) : val;
  },
});

/**
 * Verifies live Redis connectivity via PING
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('[Redis Connection Check Failed]:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Gracefully shuts down the Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisInstance) {
    try {
      redisInstance.disconnect(false);
    } finally {
      redisInstance = null;
    }
  }
}
