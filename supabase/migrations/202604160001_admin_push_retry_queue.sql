-- Migration: admin_push_retry_queue
BEGIN;

-- ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_push_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid,
  idempotency_key text NOT NULL,
  order_id uuid NOT NULL,
  target_url text NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  failure_code text NULL,
  last_error text NULL,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz NULL,
  processed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- uniqueness and helpful indexes
CREATE UNIQUE INDEX IF NOT EXISTS admin_push_retry_queue_idempotency_key_idx
  ON admin_push_retry_queue (idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS admin_push_retry_queue_dispatch_id_idx
  ON admin_push_retry_queue (dispatch_id)
  WHERE dispatch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admin_push_retry_queue_next_attempt_idx
  ON admin_push_retry_queue (next_attempt_at)
  WHERE processed_at IS NULL AND status IN ('pending','retrying');

CREATE INDEX IF NOT EXISTS admin_push_retry_queue_status_next_attempt_idx
  ON admin_push_retry_queue (status, next_attempt_at);

-- updated_at trigger
CREATE OR REPLACE FUNCTION admin_push_retry_queue_updated_at_trigger()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_admin_push_retry_queue_updated_at
BEFORE UPDATE ON admin_push_retry_queue
FOR EACH ROW
EXECUTE FUNCTION admin_push_retry_queue_updated_at_trigger();

-- notify on insert
CREATE OR REPLACE FUNCTION admin_push_retry_queue_notify_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('admin_push_retry', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER admin_push_retry_queue_notify_insert
AFTER INSERT ON admin_push_retry_queue
FOR EACH ROW
EXECUTE FUNCTION admin_push_retry_queue_notify_insert();

COMMIT;
