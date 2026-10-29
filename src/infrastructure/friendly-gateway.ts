import { z } from 'zod';
import type { FriendlyGateway } from '../domain/gateway';
import type { ActivityEvent, Person, Post, ReplyBranch } from '../domain/models';
import { ApiError } from '../shared/errors';
import { createHttp } from './http';
import type { HttpOptions } from './http';

const id = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime({ offset: true });
// The proxy strips the token from sign-in responses; any other field is dropped here too.
export const authorizationSchema = z.object({ id, accessHash: z.string().min(1) });
const fileSchema = z.object({ id, accessHash: z.string().min(1) });
const personSchema = z.object({
  id,
  accessHash: z.string().default(''),
  nickname: z.string(),
  description: z.string().default(''),
  interests: z.array(z.string()).default([]),
  avatar: fileSchema.nullable().default(null),
  email: z.string().nullable().default(null),
  socialLink: z.string().nullable().default(null),
  friendship: z
    .enum(['friends', 'incomingRequest', 'outgoingRequest', 'outgoingDecline', 'none'])
    .default('none'),
});
const plainPostSchema = z.object({
  id,
  accessHash: z.string(),
  text: z.string(),
  owner: personSchema,
  instant,
  edited: z.boolean().default(false),
  replyPreviews: z.array(personSchema).default([]),
});
const activitySchema = z.object({
  id,
  instant,
  isRead: z.boolean(),
  type: z.string(),
  post: z.unknown().optional(),
  commonDenominator: z.unknown().optional(),
  from: z.unknown().optional(),
  isMutual: z.unknown().optional(),
});
const activityPageSchema = z.object({
  data: z.array(activitySchema),
  nextId: z.string().nullable(),
});

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(502, 'Friendly returned an unsupported format. Try updating the app.');
  return result.data;
}

/**
 * Activity types of the Friendly backend (ActivityDetailsSerializable): `new_reply`,
 * `indirect_replies` and `new_request`. `reply` is the name `new_reply` had before 2026-10-23.
 * An entry whose type or payload is not understood stays visible as `unknown` instead of
 * failing the whole history.
 */
function mapActivity(value: z.infer<typeof activitySchema>): ActivityEvent {
  const base = { id: value.id, instant: value.instant, isRead: value.isRead };
  switch (value.type) {
    case 'reply':
    case 'new_reply': {
      const post = tryMapPost(value.post);
      if (post) return { ...base, kind: 'reply', post };
      break;
    }
    case 'indirect_replies': {
      const post = tryMapPost(value.post);
      const commonDenominator = tryMapPost(value.commonDenominator);
      if (post && commonDenominator)
        return { ...base, kind: 'indirectReplies', post, commonDenominator };
      break;
    }
    case 'new_request': {
      const from = personSchema.safeParse(value.from);
      if (from.success && typeof value.isMutual === 'boolean')
        return { ...base, kind: 'friendRequest', from: from.data, isMutual: value.isMutual };
      break;
    }
  }
  return { ...base, kind: 'unknown' };
}

function tryMapPost(value: unknown): Post | undefined {
  try {
    return mapPost(value);
  } catch {
    return undefined;
  }
}

function mapPost(value: unknown): Post {
  const deleted = z
    .object({ type: z.literal('deleted'), id, accessHash: z.string(), instant })
    .safeParse(value);
  if (deleted.success)
    return {
      ...deleted.data,
      text: 'Post deleted',
      owner: { id: 0, nickname: '', description: '', interests: [] },
      deleted: true,
    };
  return parse(plainPostSchema, value);
}

function mapBranch(value: unknown): ReplyBranch {
  const branch = parse(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('single'), post: z.unknown() }),
      z.object({ type: z.literal('thread'), thread: z.array(z.unknown()).min(1) }),
    ]),
    value,
  );
  return {
    type: branch.type,
    posts: (branch.type === 'single' ? [branch.post] : branch.thread).map(mapPost),
  };
}

const pageSchema = z.object({ data: z.array(z.unknown()), nextId: z.string().nullable() });
const part = encodeURIComponent;

export interface FriendlyGatewayOptions extends HttpOptions {
  /** Public API origin for capability media URLs, which the browser loads directly. */
  mediaBaseUrl?: string;
}

export function createFriendlyGateway(options: FriendlyGatewayOptions): FriendlyGateway {
  const request = createHttp(options);
  return {
    async logout(signal) {
      await request('/auth/logout', { method: 'POST', keepalive: true, signal });
    },
    async register(input, signal) {
      return parse(
        authorizationSchema,
        await request('/auth/generate', { method: 'POST', body: JSON.stringify(input), signal }),
      );
    },
    async person(userId, accessHash, signal) {
      return parse(
        z.object({ user: personSchema, commonFriends: z.array(personSchema).default([]) }),
        await request(`/users/details2/${userId}/${part(accessHash)}`, { signal }),
      );
    },
    async editProfile(input, signal) {
      const fields = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, { value }]),
      );
      await request('/users/edit', { method: 'PATCH', body: JSON.stringify(fields), signal });
    },
    async uploadAvatar(file, preupload, signal) {
      const body = new FormData();
      body.append('file', file);
      return parse(
        fileSchema,
        await request(preupload ? '/files/preupload' : '/files/upload', {
          method: 'POST',
          body,
          headers: { 'X-File-Size': String(file.size) },
          signal,
        }),
      );
    },
    fileUrl(file) {
      const base = options.mediaBaseUrl ?? options.baseUrl;
      return `${base.replace(/\/$/, '')}/files/download/${file.id}/${part(file.accessHash)}`;
    },
    async uploadMedia(file, signal) {
      const body = new FormData();
      body.append('file', file);
      return parse(
        fileSchema,
        await request('/files/upload', {
          method: 'POST',
          body,
          headers: { 'X-File-Size': String(file.size) },
          signal,
        }),
      );
    },
    async friends(signal) {
      return parse(
        z.object({ friends: z.array(personSchema) }),
        await request('/network/details', { signal }),
      ).friends;
    },
    async discover(signal) {
      return parse(
        z.object({
          entries: z.array(
            z.object({
              details: personSchema,
              commonFriends: z.array(personSchema),
              isRequest: z.boolean(),
              isExtendedNetwork: z.boolean(),
            }),
          ),
        }),
        await request('/feed/queue', { signal }),
      ).entries;
    },
    async requestFriend(userId, userAccessHash, signal) {
      await request('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ userId, userAccessHash }),
        signal,
      });
    },
    async declineFriend(userId, userAccessHash, signal) {
      await request('/friends/decline', {
        method: 'POST',
        body: JSON.stringify({ userId, userAccessHash }),
        signal,
      });
    },
    async invitation(force, signal) {
      return parse(
        z.object({ token: z.string().min(1) }),
        await request(force ? '/friends/generate/force' : '/friends/generate', {
          method: 'POST',
          signal,
        }),
      ).token;
    },
    async acceptInvitation(userId, token, signal) {
      return parse(
        z.object({ type: z.enum(['Success', 'FriendTokenExpired']) }),
        await request('/friends/add', {
          method: 'POST',
          body: JSON.stringify({ userId, token }),
          signal,
        }),
      ).type;
    },
    async linkEmail(email, signal) {
      await request('/email/link', {
        method: 'POST',
        headers: { 'X-Locale': 'ru' },
        body: JSON.stringify({ email }),
        signal,
      });
    },
    async confirmEmail(code, signal) {
      await request('/email/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: Number(code) }),
        signal,
      });
    },
    async unlinkEmail(signal) {
      await request('/email/unlink', { method: 'POST', signal });
    },
    async registerPush(firebaseToken, signal) {
      await request('/auth/firebase', {
        method: 'POST',
        body: JSON.stringify({ firebaseToken }),
        signal,
      });
    },
    async posts(cursor, signal) {
      const raw = parse(
        pageSchema,
        await request(`/community/list${cursor ? `/${part(cursor)}` : ''}`, { signal }),
      );
      return { items: raw.data.map(mapPost), nextCursor: raw.nextId };
    },
    async publish(text, replyTo, signal) {
      return parse(
        fileSchema,
        await request('/community', {
          method: 'POST',
          body: JSON.stringify({ text, ...(replyTo ? { replyTo } : {}) }),
          signal,
        }),
      );
    },
    async editPost(postId, text, signal) {
      await request(`/community/${postId}/edit`, {
        method: 'POST',
        body: JSON.stringify({ text: { value: text } }),
        signal,
      });
    },
    async deletePost(postId, signal) {
      await request(`/community/${postId}/delete`, { method: 'POST', signal });
    },
    async replies(postId, accessHash, cursor, signal) {
      const raw = parse(
        pageSchema,
        await request(
          `/community/${postId}/${part(accessHash)}/replies2${cursor ? `/${part(cursor)}` : ''}`,
          { signal },
        ),
      );
      return { items: raw.data.map(mapBranch), nextCursor: raw.nextId };
    },
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
          upstream: z.array(z.unknown()).default([]),
        }),
        await request(`/community/2/${postId}/${encodeURIComponent(accessHash)}`, { signal }),
      );
      return {
        post: mapPost(raw.post),
        upstream: raw.upstream.map(mapPost),
        replies: raw.replies.data.map(mapBranch),
        nextCursor: raw.replies.nextId,
      };
    },
  };
}
