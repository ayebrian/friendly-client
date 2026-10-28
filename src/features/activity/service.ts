import type { FriendlyGateway } from '../../domain/gateway';
import type { ActivityEvent, ActivitySnapshot } from '../../domain/models';
import { ApiError } from '../../shared/errors';

/** No count endpoint exists: count is exact only after exhausting pagination. */
export async function loadActivity(
  gateway: Pick<FriendlyGateway, 'activityPage'>,
  signal?: AbortSignal,
  pageLimit = 20,
): Promise<ActivitySnapshot> {
  const events = new Map<number, ActivityEvent>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < pageLimit; page++) {
    signal?.throwIfAborted();
    const result = await gateway.activityPage(cursor, signal);
    for (const event of result.items) if (!events.has(event.id)) events.set(event.id, event);
    cursor = result.nextCursor;
    if (cursor === null) return { items: [...events.values()], complete: true };
    if (cursors.has(cursor))
      throw new ApiError(502, 'Could not load history: Friendly returned the same page twice.');
    cursors.add(cursor);
  }
  return { items: [...events.values()], complete: false };
}

/** Short title and description of an event for in-app announcements. */
export function activitySummary(event: ActivityEvent): { title: string; description: string } {
  const excerpt = (text: string) => text.slice(0, 90);
  switch (event.kind) {
    case 'reply':
      return {
        title: 'New reply',
        description: `${event.post.owner.nickname || 'Member'}: ${excerpt(event.post.text)}`,
      };
    case 'indirectReplies':
      return {
        title: 'New replies in a thread you follow',
        description: excerpt(event.post.text),
      };
    case 'friendRequest':
      return event.isMutual
        ? { title: 'New friend', description: `${event.from.nickname} accepted your request` }
        : { title: 'Friend request', description: `${event.from.nickname} wants to be friends` };
    case 'unknown':
      return { title: 'New activity', description: 'Open notifications' };
  }
}

export function unreadCount(snapshot?: ActivitySnapshot) {
  return snapshot?.items.filter((item) => !item.isRead).length ?? 0;
}

export function countLabel(snapshot?: ActivitySnapshot) {
  const count = unreadCount(snapshot);
  if (!snapshot) return '';
  return snapshot.complete ? (count > 99 ? '99+' : String(count)) : `${Math.min(count, 99)}+`;
}

export async function markRead(
  gateway: Pick<FriendlyGateway, 'readActivity'>,
  ids: number[],
  signal?: AbortSignal,
) {
  const failed: number[] = [];
  for (const id of ids) {
    signal?.throwIfAborted();
    try {
      await gateway.readActivity(id, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof ApiError && error.status === 401) throw error;
      failed.push(id);
    }
  }
  if (failed.length) throw new ReadError(failed);
}

export class ReadError extends Error {
  constructor(public readonly failedIds: number[]) {
    super(
      'Some notifications could not be marked as read. Their status has been restored. Please try again.',
    );
  }
}
