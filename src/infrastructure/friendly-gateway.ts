import { z } from 'zod';
import type { FriendlyGateway } from '../domain/gateway';
import type { ActivityEvent, Person, Post } from '../domain/models';
import { ApiError } from '../shared/errors';
import { createHttp } from './http';
import type { HttpOptions } from './http';

const id = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime({ offset: true });
export const authorizationSchema = z.object({
  id,
  token: z.string().min(1),
  accessHash: z.string().min(1),
});
const personSchema = z.object({
  id,
  nickname: z.string(),
  description: z.string().default(''),
  interests: z.array(z.string()).default([]),
});
const plainPostSchema = z.object({
  id,
  accessHash: z.string(),
  text: z.string(),
  owner: personSchema,
  instant,
});
const activitySchema = z.object({
  id,
  instant,
  isRead: z.boolean(),
  type: z.string(),
  post: z.unknown().optional(),
});
const activityPageSchema = z.object({
  data: z.array(activitySchema),
  nextId: z.string().nullable(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(502, 'Формат данных Friendly изменился. Попробуйте обновить клиент.');
  return result.data;
}

function mapActivity(value: z.infer<typeof activitySchema>): ActivityEvent {
  return {
    id: value.id,
    instant: value.instant,
    isRead: value.isRead,
    kind: value.type === 'reply' ? 'reply' : 'unknown',
    post: value.type === 'reply' ? parse(plainPostSchema, value.post) : undefined,
  };
}

function mapPost(value: unknown): Post {
  const deleted = z
    .object({ type: z.literal('deleted'), id, accessHash: z.string(), instant })
    .safeParse(value);
  if (deleted.success)
    return {
      ...deleted.data,
      text: 'Публикация удалена',
      owner: { id: 0, nickname: '', description: '', interests: [] },
      deleted: true,
    };
  return parse(plainPostSchema, value);
}

export function createFriendlyGateway(options: HttpOptions): FriendlyGateway {
  const request = createHttp(options);
  return {
    async sendLoginCode(email, signal) {
      await request('/auth/email', {
        method: 'POST',
        headers: { 'X-Locale': 'ru' },
        body: JSON.stringify({ email }),
        signal,
      });
    },
    async login(email, code, signal) {
      return parse(
        authorizationSchema,
        await request('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, code: Number(code) }),
          signal,
        }),
      );
    },
    async profile(signal): Promise<Person> {
      return parse(z.object({ user: personSchema }), await request('/users/details2', { signal }))
        .user;
    },
    async activityPage(cursor, signal) {
      const data = parse(
        activityPageSchema,
        await request(`/activity/list${cursor ? `/${encodeURIComponent(cursor)}` : ''}`, {
          signal,
        }),
      );
      return { items: data.data.map(mapActivity), nextCursor: data.nextId };
    },
    async readActivity(eventId, signal) {
      await request(`/activity/read/${eventId}`, { method: 'POST', signal });
    },
    async thread(postId, accessHash, signal) {
      const raw = parse(
        z.object({
          post: z.unknown(),
          replies: z.object({ data: z.array(z.unknown()), nextId: z.string().nullable() }),
        }),
        await request(`/community/2/${postId}/${encodeURIComponent(accessHash)}`, { signal }),
      );
      const replies = raw.replies.data.flatMap((value) => {
        const single = z.object({ type: z.literal('single'), post: z.unknown() }).safeParse(value);
        if (single.success) return [mapPost(single.data.post)];
        const thread = parse(
          z.object({ type: z.literal('thread'), thread: z.array(z.unknown()) }),
          value,
        );
        return thread.thread.map(mapPost);
      });
      return { post: mapPost(raw.post), replies, hasMore: raw.replies.nextId !== null };
    },
  };
}
