import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const collection = { create: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const send = vi.fn();
  return {
    authStore: { record: { id: 'alice' }, isValid: false, onChange: vi.fn() },
    autoCancellation: vi.fn(),
    createBatch: () => ({ collection: () => collection, send }),
    collection: () => ({ getFullList: vi.fn().mockRejectedValue({ status: 0 }) }),
    send,
    writes: collection,
  };
});
vi.mock('pocketbase', () => ({ default: class { constructor() { return sdk; } } }));
vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
import { flush, insert, listAll, update } from './db';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  sdk.authStore.record = { id: 'alice' };
  sdk.authStore.isValid = true;
  sdk.send.mockResolvedValue([]);
});

describe('offline persistence', () => {
  it('retries a disconnected create with the same id', async () => {
    sdk.send.mockRejectedValueOnce({ status: 0 });
    expect(await insert('todos', [{ id: 'task-a' }])).toBeNull();
    expect(await flush()).toBe(1);
    expect(sdk.writes.upsert).toHaveBeenCalledWith({ id: 'task-a', owner: 'alice' });
    expect(JSON.parse(localStorage.getItem('zings-outbox-alice')!)).toEqual([]);
  });

  it('keeps refused writes for recovery instead of silently deleting them', async () => {
    sdk.send.mockRejectedValueOnce({ status: 0 });
    await update('todos', ['task-a'], { title: 'Keep this' });
    sdk.send.mockRejectedValueOnce({ status: 403 });
    expect(await flush()).toBe(0);
    expect(JSON.parse(localStorage.getItem('zings-outbox-alice')!)).toHaveLength(1);
    expect(await flush()).toBe(1);
  });

  it('does not send another account’s queued changes', async () => {
    sdk.send.mockRejectedValueOnce({ status: 0 });
    await update('todos', ['task-a'], { title: 'Private' });
    sdk.authStore.record = { id: 'bob' };
    sdk.send.mockClear();
    expect(await flush()).toBe(0);
    expect(sdk.send).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('zings-outbox-alice')!)).toHaveLength(1);
  });

  it('reports a full browser store instead of claiming a write was saved', async () => {
    sdk.send.mockRejectedValueOnce({ status: 0 });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('QuotaExceeded'); });
    try {
      expect(await update('todos', ['task-a'], { title: 'Unsaved' })).toBeInstanceOf(Error);
    } finally { spy.mockRestore(); }
  });

  it('applies queued edits to the cached copy when offline', async () => {
    localStorage.setItem('zings-cache-alice-todos', JSON.stringify([{ id: 'task-a', title: 'Old' }]));
    sdk.send.mockRejectedValueOnce({ status: 0 });
    await update('todos', ['task-a'], { title: 'New' });
    expect((await listAll('todos')).data).toEqual([{ id: 'task-a', title: 'New' }]);
  });
});
