import request from 'supertest';
import { createApp } from '../src/app';
import { closePool } from '../src/db/index';
import { closeRedis } from '../src/redis/index';

describe('Health Check & Basic API Routing', () => {
  const app = createApp();

  afterAll(async () => {
    await closePool();
    await closeRedis();
  });

  it('GET /api/health should return 200 OK with system status', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('OK');
    expect(res.body.data.service).toBe('ticket-booking-platform-api');
    expect(res.body.data.database).toBe('CONNECTED');
    expect(res.body.data.redis).toBe('CONNECTED');
    expect(typeof res.body.data.uptime).toBe('number');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(res.body.data.memoryUsage).toBeDefined();
    expect(typeof res.body.data.memoryUsage.rss).toBe('string');
  });

  it('GET /api/nonexistent-route should return 404 Route not found', async () => {
    const res = await request(app).get('/api/nonexistent-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Route not found');
  });
});
