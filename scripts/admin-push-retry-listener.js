#!/usr/bin/env node
/* eslint-disable no-console */
const { Client } = require('pg');
const crypto = require('node:crypto');
const fetch = global.fetch ?? require('node-fetch');

if (!process.env.PG_CONNECTION_STRING && !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
  console.error('Missing PG_CONNECTION_STRING / DATABASE_URL / SUPABASE_DB_URL environment variable.');
  process.exit(1);
}

const CONNECTION_STRING = process.env.PG_CONNECTION_STRING || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const STOREFRONT_INTERNAL_AUTH_TOKEN = process.env.STOREFRONT_INTERNAL_AUTH_TOKEN;
const ADMIN_DASHBOARD_BASE_URL = process.env.ADMIN_DASHBOARD_BASE_URL;
const MAX_ATTEMPTS = Number(process.env.ADMIN_PUSH_RETRY_MAX_ATTEMPTS ?? 6);
const LOCK_TTL_SECONDS = Number(process.env.ADMIN_PUSH_RETRY_LOCK_TTL_SECONDS ?? 120);

// In-memory timer registry: Map<id, { timer: Timeout, scheduledAt: number }>
const timers = new Map();

function base64UrlEncode(input) {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function signHmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function signInternalRequestToken({ secret, issuer, audience, purpose, method, path, orderId, expiresInSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'internal-request' };
  const claims = {
    iss: issuer,
    aud: audience,
    purpose,
    method: method.toUpperCase(),
    path,
    iat: now,
    exp: now + (expiresInSeconds ?? 60),
    ...(orderId ? { orderId } : {}),
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaims = base64UrlEncode(claims);
  const signature = signHmac(secret, `${encodedHeader}.${encodedClaims}`);
  return `${encodedHeader}.${encodedClaims}.${signature}`;
}

async function main() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();

  client.on('notification', async (msg) => {
    try {
      const id = msg.payload;
      console.info('NOTIFY received for', id);
      await handleNotification(client, id);
    } catch (err) {
      console.error('notification_handler_error', err instanceof Error ? err.message : String(err));
    }
  });

  // startup: process overdue rows and schedule future rows
  await sweepDueRows(client);
  await scheduleFutureRowsOnStartup(client);

  await client.query("LISTEN admin_push_retry");
  console.info('Listening for admin_push_retry notifications...');
}

async function sweepDueRows(client) {
  const res = await client.query(
    `SELECT id FROM admin_push_retry_queue
     WHERE processed_at IS NULL
       AND status IN ('pending','retrying')
       AND (locked_until IS NULL OR locked_until < now())
       AND next_attempt_at <= now()
     LIMIT 50`
  );

  for (const row of res.rows) {
    await handleNotification(client, row.id).catch((err) => console.error('sweep_handle_error', err));
  }
}

async function scheduleFutureRowsOnStartup(client) {
  const res = await client.query(
    `SELECT id, next_attempt_at FROM admin_push_retry_queue
     WHERE processed_at IS NULL
       AND status IN ('pending','retrying')
       AND next_attempt_at > now()
     LIMIT 1000`
  );

  for (const row of res.rows) {
    const scheduledAt = new Date(row.next_attempt_at).getTime();
    scheduleRetryTimer(client, row.id, scheduledAt);
    console.info('startup_timer_scheduled', { id: row.id, next_attempt_at: row.next_attempt_at });
  }
}

function scheduleRetryTimer(client, id, scheduledAtMs) {
  try {
    const existing = timers.get(id);
    if (existing) {
      if (existing.scheduledAt <= scheduledAtMs) {
        // existing is earlier or equal -> keep existing timer
        console.info('timer_keep_existing', { id, existingAt: new Date(existing.scheduledAt).toISOString(), newAt: new Date(scheduledAtMs).toISOString() });
        return;
      }

      // replace existing timer with an earlier one
      clearTimeout(existing.timer);
      timers.delete(id);
      console.info('timer_replaced', { id, oldAt: new Date(existing.scheduledAt).toISOString(), newAt: new Date(scheduledAtMs).toISOString() });
    }

    const delayMs = Math.max(0, scheduledAtMs - Date.now());
    const timer = setTimeout(async () => {
      console.info('timer_fired', { id });
      timers.delete(id);
      try {
        await handleNotification(client, id);
      } catch (err) {
        console.error('timer_handle_error', err instanceof Error ? err.message : String(err));
      }
    }, delayMs);

    timers.set(id, { timer, scheduledAt: scheduledAtMs });
    console.info('timer_scheduled', { id, scheduledAt: new Date(scheduledAtMs).toISOString(), delayMs });
  } catch (err) {
    console.error('schedule_retry_timer_error', err instanceof Error ? err.message : String(err));
  }
}

function clearRetryTimer(id) {
  const entry = timers.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    timers.delete(id);
    console.info('timer_cleared', { id });
  }
}

async function attemptClaim(client, id) {
  const claimRes = await client.query(
    `UPDATE admin_push_retry_queue
     SET locked_until = now() + ($2 || ' seconds')::interval, status = 'retrying'
     WHERE id = $1
       AND processed_at IS NULL
       AND status IN ('pending','retrying')
       AND (locked_until IS NULL OR locked_until < now())
       AND next_attempt_at <= now()
     RETURNING *;`,
    [id, LOCK_TTL_SECONDS]
  );

  if (!claimRes.rowCount) {
    return null;
  }

  return claimRes.rows[0];
}

async function handleNotification(client, id) {
  // load the row first to decide scheduling vs immediate processing
  const rowRes = await client.query(`SELECT * FROM admin_push_retry_queue WHERE id = $1`, [id]);
  const row = rowRes.rows[0];
  if (!row) return;

  if (row.processed_at || row.status === 'processed' || row.status === 'dead_letter') {
    clearRetryTimer(id);
    return;
  }

  const nextAttemptMs = new Date(row.next_attempt_at).getTime();
  if (nextAttemptMs > Date.now()) {
    // schedule a timer to wake this row at the proper time
    scheduleRetryTimer(client, id, nextAttemptMs);
    return;
  }

  // attempt to claim and process
  const claimed = await attemptClaim(client, id);
  if (!claimed) {
    // someone else may have claimed or the row was rescheduled; fetch latest and schedule if needed
    const latestRes = await client.query(`SELECT next_attempt_at, status, processed_at FROM admin_push_retry_queue WHERE id = $1`, [id]);
    const latest = latestRes.rows[0];
    if (!latest) return;
    if (latest.processed_at || latest.status === 'processed' || latest.status === 'dead_letter') {
      clearRetryTimer(id);
      return;
    }
    const latestNextMs = new Date(latest.next_attempt_at).getTime();
    if (latestNextMs > Date.now()) {
      scheduleRetryTimer(client, id, latestNextMs);
    }
    return;
  }

  console.info('claimed retry row', { id: claimed.id, attempts: claimed.attempts });

  const attemptNumber = Number(claimed.attempts ?? 0) + 1;

  try {
    const payload = claimed.payload || {};
    const method = (payload.method || 'POST').toUpperCase();
    const target = claimed.target_url;
    const body = payload.body ? JSON.stringify(payload.body) : null;

    // sign token for admin internal endpoint
    const urlObj = new URL(target);
    const path = urlObj.pathname + (urlObj.search || '');

    if (!STOREFRONT_INTERNAL_AUTH_TOKEN) {
      throw new Error('Missing STOREFRONT_INTERNAL_AUTH_TOKEN');
    }

    const token = signInternalRequestToken({
      secret: STOREFRONT_INTERNAL_AUTH_TOKEN,
      issuer: 'kira-bakery-storefront',
      audience: 'kira-bakery-admin',
      purpose: 'admin_paid_order_push_dispatch',
      method,
      path,
      orderId: claimed.order_id,
    });

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    };

    const resp = await fetch(target, { method, headers, body });

    if (resp.ok) {
      await client.query(
        `UPDATE admin_push_retry_queue
         SET processed_at = now(), status = 'processed', locked_until = NULL, updated_at = now()
         WHERE id = $1`,
        [id]
      );
      clearRetryTimer(id);
      console.info('retry_processed', { id });
      return;
    }

    const text = await resp.text().catch(() => null);
    const failureCode = `http_${resp.status}`;
    const lastError = text ?? `HTTP ${resp.status}`;

    await rescheduleRow(client, claimed, attemptNumber, failureCode, lastError);
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    await rescheduleRow(client, claimed, attemptNumber, 'worker_error', lastError);
  }
}

async function rescheduleRow(client, row, attemptNumber, failureCode, lastError) {
  const maxAttempts = MAX_ATTEMPTS;
  if (attemptNumber >= maxAttempts) {
    await client.query(
      `UPDATE admin_push_retry_queue
       SET attempts = $2, failure_code = $3, last_error = $4, status = 'dead_letter', locked_until = NULL, updated_at = now()
       WHERE id = $1`,
      [row.id, attemptNumber, failureCode, lastError]
    );

    clearRetryTimer(row.id);
    console.error('retry_dead_letter', { id: row.id, attempts: attemptNumber, failureCode, lastError });
    return;
  }

  // exponential backoff with jitter: base 30s, double per attempt, cap 1h
  const baseMs = 30_000;
  const capMs = 3_600_000;
  const raw = Math.min(capMs, baseMs * Math.pow(2, attemptNumber - 1));
  const jitterFactor = 0.5 + Math.random(); // [0.5,1.5)
  const delayMs = Math.round(raw * jitterFactor);
  const scheduledAtMs = Date.now() + delayMs;

  await client.query(
    `UPDATE admin_push_retry_queue
     SET attempts = $2, failure_code = $3, last_error = $4, next_attempt_at = now() + ($5 || ' milliseconds')::interval, locked_until = NULL, status = 'pending', updated_at = now()
     WHERE id = $1`,
    [row.id, attemptNumber, failureCode, lastError, delayMs]
  );

  console.info('retry_rescheduled', { id: row.id, attempts: attemptNumber, next_in_ms: delayMs });

  // schedule new timer immediately so we don't depend on another DB notify
  scheduleRetryTimer(client, row.id, scheduledAtMs);
}

main().catch((err) => {
  console.error('listener_fatal', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
