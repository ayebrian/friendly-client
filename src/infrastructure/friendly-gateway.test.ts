import { describe, expect, it, vi } from 'vitest';
import { createHttp } from './http';
import { createFriendlyGateway } from './friendly-gateway';
import activityList from './fixtures/activity-list.json?raw';

const userId = 42;
const json = (data: unknown) => new Response(JSON.stringify(data));
/** `/activity/list` page in the shape of the Friendly backend's ActivityDetailsSerializable. */
const activityFixture = () => activityList;

describe('HTTP and protocol boundary', () => {
  it('names the account for the proxy, sends no token and escapes opaque cursor segments', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [], nextId: null }));
    await createFriendlyGateway({ baseUrl: '/api/', userId, fetcher }).activityPage('a/b+c');
    expect(fetcher.mock.calls[0][0]).toBe('/api/activity/list/a%2Fb%2Bc');
    const options = fetcher.mock.calls[0][1]!;
    const headers = options.headers as Headers;
    expect(headers.get('X-Token')).toBeNull();
    expect(headers.get('X-User-Id')).toBe('42');
    expect(options.credentials).toBe('same-origin');
  });
  it('keeps the token of a sign-in response out of the returned account', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ id: 42, accessHash: 'test-hash', token: 'unexpected' }));
    const account = await createFriendlyGateway({ baseUrl: '/api', fetcher }).login(
      'test@example.test',
      '12345678',
    );
    expect(account).toEqual({ id: 42, accessHash: 'test-hash' });
    expect((fetcher.mock.calls[0][1]!.headers as Headers).get('X-User-Id')).toBeNull();
  });
  it('builds media URLs on the public API, not on the proxy', () => {
    const gateway = createFriendlyGateway({
      baseUrl: '/api',
      mediaBaseUrl: 'https://api.example.test/',
    });
    expect(gateway.fileUrl({ id: 3, accessHash: 'a/b' })).toBe(
      'https://api.example.test/files/download/3/a%2Fb',
    );
  });
  it('follows the proxy when the session cookie belongs to another account', async () => {
    const onUnauthorized = vi.fn();
    const onSessionChanged = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify({ error: 'session_changed' }), {
          status: 409,
          headers: { 'X-Friendly-Session': 'changed' },
        }),
    );
    await expect(
      createHttp({ baseUrl: '', userId, fetcher, onUnauthorized, onSessionChanged })('/feed/queue'),
    ).rejects.toMatchObject({ status: 409 });
    expect(onSessionChanged).toHaveBeenCalledOnce();
    expect(onUnauthorized).not.toHaveBeenCalled();
    // A backend conflict is not a session change.
    fetcher.mockResolvedValue(new Response(null, { status: 409 }));
    await expect(
      createHttp({ baseUrl: '', userId, fetcher, onSessionChanged })('/feed/queue'),
    ).rejects.toMatchObject({ status: 409 });
    expect(onSessionChanged).toHaveBeenCalledOnce();
  });
  it('expires authenticated sessions on 401 only', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      createHttp({ baseUrl: '', fetcher, onUnauthorized })('/auth/email'),
    ).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    await expect(
      createHttp({ baseUrl: '', userId, fetcher, onUnauthorized })('/activity/list'),
    ).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it('distinguishes permission failures from sign-in code errors without ending the session', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(
      createFriendlyGateway({ baseUrl: '', userId, fetcher, onUnauthorized }).invitation(false),
    ).rejects.toMatchObject({
      status: 403,
      message: 'You do not have permission to perform this action.',
    });
    await expect(
      createFriendlyGateway({ baseUrl: '', fetcher, onUnauthorized }).login(
        'test@example.test',
        '12345678',
      ),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Access denied or your sign-in code has expired.',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
  it('handles an empty mutation response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      createFriendlyGateway({ baseUrl: '', userId, fetcher }).readActivity(2),
    ).resolves.toBeUndefined();
  });
  it('revokes the session through the proxy logout route', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}));
    await createFriendlyGateway({ baseUrl: '/api', userId, fetcher }).logout();
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/auth/logout');
    expect(options?.method).toBe('POST');
    expect(options?.keepalive).toBe(true);
    expect((options?.headers as Headers).get('X-Token')).toBeNull();
    expect((options?.headers as Headers).get('X-User-Id')).toBe(String(userId));
  });
  it('keeps unknown event types visible without requiring a reply payload', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        data: [{ id: 1, type: 'future-event', instant: '2026-09-30T12:00:00Z', isRead: false }],
        nextId: null,
      }),
    );
    const data = await createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null);
    expect(data.items[0].kind).toBe('unknown');
  });
  it('keeps a reply notification for a post that was deleted', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        data: [
          {
            id: 1,
            type: 'reply',
            instant: '2026-09-30T12:00:00Z',
            isRead: false,
            post: {
              type: 'deleted',
              id: 5,
              accessHash: 'reply-hash',
              instant: '2026-09-30T12:00:00Z',
            },
          },
        ],
        nextId: null,
      }),
    );
    const data = await createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null);
    expect(data.items[0]).toMatchObject({ kind: 'reply', post: { deleted: true } });
  });
  it('maps the current backend activity types from a recorded-shape payload', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(activityFixture()));
    const data = await createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null);
    expect(data.items.map((item) => [item.id, item.kind])).toEqual([
      [7, 'friendRequest'],
      [6, 'friendRequest'],
      [5, 'indirectReplies'],
      [4, 'reply'],
    ]);
    const [request, accepted, indirect, reply] = data.items;
    expect(request).toMatchObject({
      isMutual: false,
      isRead: false,
      from: { id: 31, accessHash: 'anna-hash', nickname: 'Anna', friendship: 'incomingRequest' },
    });
    expect(accepted).toMatchObject({
      isMutual: true,
      from: { nickname: 'Boris', avatar: { id: 900, accessHash: 'avatar-hash' } },
    });
    expect(indirect).toMatchObject({
      post: { id: 120, text: 'Who is up for a hike on Saturday?', owner: { nickname: 'Vera' } },
      commonDenominator: { id: 122, accessHash: 'branch-hash', text: 'I can bring the tent' },
    });
    expect(reply).toMatchObject({ post: { id: 110, text: 'Thanks, see you there!' } });
  });
  it('keeps the pre-rename reply type and a deleted common denominator', async () => {
    const owner = { id: 2, accessHash: 'o', nickname: 'Owner', description: '', interests: [] };
    const post = { id: 1, accessHash: 'p', text: 'Root', owner, instant: '2026-10-20T10:00:00Z' };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        data: [
          { id: 2, type: 'reply', instant: '2026-10-20T10:00:00Z', isRead: true, post },
          {
            id: 1,
            type: 'indirect_replies',
            instant: '2026-10-20T10:00:00Z',
            isRead: false,
            post,
            commonDenominator: {
              type: 'deleted',
              id: 3,
              accessHash: 'gone',
              instant: '2026-10-20T10:00:00Z',
              replyPreviews: [],
              newUnreadId: null,
            },
          },
        ],
        nextId: null,
      }),
    );
    const data = await createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null);
    expect(data.items[0]).toMatchObject({ kind: 'reply', post: { text: 'Root' } });
    expect(data.items[1]).toMatchObject({
      kind: 'indirectReplies',
      commonDenominator: { id: 3, accessHash: 'gone', deleted: true },
    });
  });
  it('shows a known type with an unexpected payload as unknown without failing the page', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        data: [
          { id: 3, type: 'new_request', instant: '2026-10-20T10:00:00Z', isRead: false },
          { id: 2, type: 'new_reply', instant: '2026-10-20T10:00:00Z', isRead: false, post: 1 },
          {
            id: 1,
            type: 'new_request',
            instant: '2026-10-20T10:00:00Z',
            isRead: false,
            from: { id: 5, nickname: 'Dina' },
            isMutual: 'yes',
          },
        ],
        nextId: null,
      }),
    );
    const data = await createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null);
    expect(data.items.map((item) => item.kind)).toEqual(['unknown', 'unknown', 'unknown']);
  });
  it('rejects malformed payloads and unsafe 64-bit IDs', async () => {
    for (const data of [
      { data: 'wrong', nextId: null },
      {
        data: [
          {
            id: Number.MAX_SAFE_INTEGER + 1,
            type: 'unknown',
            instant: '2026-09-30T12:00:00Z',
            isRead: false,
          },
        ],
        nextId: null,
      },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(data));
      await expect(
        createFriendlyGateway({ baseUrl: '', fetcher }).activityPage(null),
      ).rejects.toMatchObject({ status: 502 });
    }
  });
  it('maps login code to the API number format and applies locale', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null))
      .mockResolvedValueOnce(json({ id: userId, accessHash: 'test-hash' }));
    const api = createFriendlyGateway({ baseUrl: '', fetcher });
    await api.sendLoginCode('test@example.test');
    await api.login('test@example.test', '00123456');
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get('X-Locale')).toBe('ru');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).code).toBe(123456);
  });
});
