import pg from 'pg';
import { query } from '../db/index.js';
import { CreatePaymentRecordDTO, Payment, PaymentStatus } from '../types/payment.js';

export class PaymentRepository {
  async create(data: CreatePaymentRecordDTO, client?: pg.PoolClient): Promise<Payment> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      INSERT INTO payments (
        booking_id,
        amount,
        status,
        provider,
        transaction_reference,
        idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const params = [
      data.booking_id,
      data.amount,
      data.status || 'PENDING',
      data.provider || 'MOCK_GATEWAY',
      data.transaction_reference || null,
      data.idempotency_key || null,
    ];

    const res = await runner<Payment>(sql, params);
    return res.rows[0];
  }

  async findById(id: string, client?: pg.PoolClient): Promise<Payment | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = 'SELECT * FROM payments WHERE id = $1';
    const res = await runner<Payment>(sql, [id]);
    return res.rows[0] || null;
  }

  async findByBookingId(bookingId: string, client?: pg.PoolClient): Promise<Payment[]> {
    const runner = client ? client.query.bind(client) : query;
    const sql = 'SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC';
    const res = await runner<Payment>(sql, [bookingId]);
    return res.rows;
  }

  async findByTransactionReference(ref: string, client?: pg.PoolClient): Promise<Payment | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = 'SELECT * FROM payments WHERE transaction_reference = $1';
    const res = await runner<Payment>(sql, [ref]);
    return res.rows[0] || null;
  }

  async updateStatus(
    id: string,
    status: PaymentStatus,
    client?: pg.PoolClient
  ): Promise<Payment | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      UPDATE payments 
      SET status = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    const res = await runner<Payment>(sql, [status, id]);
    return res.rows[0] || null;
  }

  async updateTransactionReference(
    id: string,
    ref: string,
    client?: pg.PoolClient
  ): Promise<Payment | null> {
    const runner = client ? client.query.bind(client) : query;
    const sql = `
      UPDATE payments 
      SET transaction_reference = $1, updated_at = NOW() 
      WHERE id = $2 
      RETURNING *
    `;
    const res = await runner<Payment>(sql, [ref, id]);
    return res.rows[0] || null;
  }
}

export const paymentRepository = new PaymentRepository();

