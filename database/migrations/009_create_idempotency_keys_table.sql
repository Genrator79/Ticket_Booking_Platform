-- Migration: 009_create_idempotency_keys_table.sql
-- Purpose: Persistent audit and long-term storage for idempotent API request records.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_path VARCHAR(255) NOT NULL,
  request_params_hash VARCHAR(64) NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_id ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys(created_at);

