import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSupabaseServerClientMock = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: getSupabaseServerClientMock,
}));

import { enqueueAdminPushRetry } from '@/lib/push/admin-paid-order';

describe('admin push retry enqueue', () => {
  beforeEach(() => {
    vi.resetModules();
    getSupabaseServerClientMock.mockReset();
  });

  it('upserts a durable retry row with idempotency key and payload', async () => {
    const selectResult = { data: [{ id: 'row-123' }], error: null };
    const selectMock = vi.fn().mockResolvedValue(selectResult);
    const upsertMock = vi.fn().mockReturnValue({ select: selectMock });
    const fromMock = vi.fn((table: string) => {
      if (table === 'admin_push_retry_queue') {
        return { upsert: upsertMock };
      }
      throw new Error('Unexpected table ' + table);
    });

    getSupabaseServerClientMock.mockReturnValue({ from: fromMock });

    const url = 'https://admin.example/api/internal/push/admin-paid-orders/process';

    await enqueueAdminPushRetry('11111111-1111-4111-8111-111111111111', url, { orderId: '11111111-1111-4111-8111-111111111111' }, 'dispatch-1', 'network_error', 'failed');

    expect(fromMock).toHaveBeenCalledWith('admin_push_retry_queue');
    expect(upsertMock).toHaveBeenCalled();

    const arg = upsertMock.mock.calls[0][0];
    expect(arg).toHaveProperty('idempotency_key', 'admin_paid_order:11111111-1111-4111-8111-111111111111');
    expect(arg).toHaveProperty('order_id', '11111111-1111-4111-8111-111111111111');
    expect(arg).toHaveProperty('target_url', url);
    expect(arg).toHaveProperty('payload');
    expect(arg.payload).toHaveProperty('body');
    expect(arg.payload.body).toEqual({ orderId: '11111111-1111-4111-8111-111111111111' });
  });
});
