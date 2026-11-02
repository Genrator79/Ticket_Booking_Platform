import pg from 'pg';
import { query } from '../db/index.js';
import { CreateIdempotencyDTO, IdempotencyRecord } from '../types/idempotency.js';

export class IdempotencyRepository {
  async create(dto: CreateIdempotencyDTO, client?: pg.PoolClient): Promise<IdempotencyRecord> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      INSERT INTO idempotency_keys (
        key,
        user_id,
        request_path,
        request_params_hash,
        status_code,
        response_body
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (user_id, key) DO UPDATE
      SET status_code = EXCLUDED.status_code,
          response_body = EXCLUDED.response_body,
          updated_at = NOW()
      RETURNING *
    `;
    const params = [
      dto.key,
      dto.userId,
      dto.requestPath,
      dto.requestParamsHash,
      dto.statusCode,
      JSON.stringify(dto.responseBody),
    ];

    const res = await runner<IdempotencyRecord>(sql, params);
    return res.rows[0];
  }

  async findByKey(
    userId: string,
    key: string,
    client?: pg.PoolClient
  ): Promise<IdempotencyRecord | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      SELECT * FROM idempotency_keys 
      WHERE user_id = $1 AND key = $2
    `;
    const res = await runner<IdempotencyRecord>(sql, [userId, key]);
    return res.rows[0] || null;
  }

  async delete(userId: string, key: string, client?: pg.PoolClient): Promise<void> {
    const runner = client ? client.query.bind(client) : query;
    const sql = 'DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2';
    await runner(sql, [userId, key]);
  }
}

export const idempotencyRepository = new IdempotencyRepository();
