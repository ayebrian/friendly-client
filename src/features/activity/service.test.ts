import { describe, expect, it, vi } from 'vitest';
import type { FriendlyGateway } from '../../domain/gateway';
import type { ActivityEvent, ActivityPage } from '../../domain/models';
import { countLabel, loadActivity, markRead, ReadError, unreadCount } from './service';
import { ApiError } from '../../shared/errors';

const event = (id: number, isRead = false): ActivityEvent => ({
  id,
  isRead,
  kind: 'unknown',
  instant: '2026-09-30T12:00:00Z',
});
function gateway(pages: ActivityPage[]): Pick<FriendlyGateway, 'activityPage' | 'readActivity'> {
  return {
    activityPage: vi.fn(async () => pages.shift()!),
    readActivity: vi.fn(async () => {}),
  };
}

describe('activity pagination and counters', () => {
  it('counts unread across all pages and deduplicates overlapping events', async () => {
    const api = gateway([
      { items: [event(3), event(2, true)], nextCursor: 'older' },
      { items: [event(2), event(1)], nextCursor: null },
    ]);
    const snapshot = await loadActivity(api);
    expect(snapshot.complete).toBe(true);
    expect(snapshot.items.map((item) => item.id)).toEqual([3, 2, 1]);
    expect(unreadCount(snapshot)).toBe(2);
    expect(countLabel(snapshot)).toBe('2');
    expect(api.activityPage).toHaveBeenNthCalledWith(2, 'older', undefined);
  });
  it('reports a lower bound when the page budget is exhausted', async () => {
    const snapshot = await loadActivity(
      gateway([{ items: [event(4)], nextCursor: 'next' }]),
      undefined,
      1,
    );
    expect(snapshot.complete).toBe(false);
    expect(countLabel(snapshot)).toBe('1+');
  });
  it('does not hide an incomplete history even if loaded events are read', () => {
    expect(countLabel({ items: [event(1, true)], complete: false })).toBe('0+');
  });
  it('rejects cyclic cursors instead of looping forever', async () => {
    const api = gateway([
      { items: [event(2)], nextCursor: 'same' },
      { items: [event(1)], nextCursor: 'same' },
    ]);
    await expect(loadActivity(api)).rejects.toThrow('returned the same page twice');
  });
  it('honors cancellation before sending another page request', async () => {
    const api = gateway([]);
    const abort = new AbortController();
    abort.abort();
    await expect(loadActivity(api, abort.signal)).rejects.toThrow();
    expect(api.activityPage).not.toHaveBeenCalled();
  });
  it('preserves partial success and identifies only failed reads', async () => {
    const api = gateway([]);
    vi.mocked(api.readActivity).mockImplementation(async (id) => {
      if (id === 2) throw new Error('offline');
    });
    try {
      await markRead(api, [1, 2, 3]);
      throw new Error('Expected read failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ReadError);
      expect((error as ReadError).failedIds).toEqual([2]);
    }
    expect(api.readActivity).toHaveBeenCalledTimes(3);
  });
  it('stops reads when the session expires', async () => {
    const api = gateway([]);
    vi.mocked(api.readActivity).mockRejectedValue(new ApiError(401, 'expired'));
    await expect(markRead(api, [1, 2])).rejects.toMatchObject({ status: 401 });
    expect(api.readActivity).toHaveBeenCalledTimes(1);
  });
});
