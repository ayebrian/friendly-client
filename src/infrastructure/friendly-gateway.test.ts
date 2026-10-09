import { describe, expect, it, vi } from 'vitest';
import { createHttp } from './http';
import { createFriendlyGateway } from './friendly-gateway';

const authorization = { id: 42, token: 'test-token', accessHash: 'test-hash' };
const json = (data: unknown) => new Response(JSON.stringify(data));

describe('HTTP and protocol boundary', () => {
  it('sets authorization headers and escapes opaque cursor segments', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ data: [], nextId: null }));
    await createFriendlyGateway({
      baseUrl: 'https://example.test/',
      authorization,
      fetcher,
    }).activityPage('a/b+c');
    expect(fetcher.mock.calls[0][0]).toBe('https://example.test/activity/list/a%2Fb%2Bc');
    const headers = fetcher.mock.calls[0][1]!.headers as Headers;
    expect(headers.get('X-Token')).toBe('test-token');
    expect(headers.get('X-User-Id')).toBe('42');
  });
  it('expires authenticated sessions on 401 only', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 }));
    await expect(
      createHttp({ baseUrl: '', fetcher, onUnauthorized })('/auth/email'),
    ).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
    await expect(
      createHttp({ baseUrl: '', authorization, fetcher, onUnauthorized })('/activity/list'),
    ).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
  it('distinguishes permission failures from sign-in code errors without ending the session', async () => {
    const onUnauthorized = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
    await expect(
      createFriendlyGateway({ baseUrl: '', authorization, fetcher, onUnauthorized }).invitation(
        false,
      ),
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
      createFriendlyGateway({ baseUrl: '', authorization, fetcher }).readActivity(2),
    ).resolves.toBeUndefined();
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
      .mockResolvedValueOnce(json(authorization));
    const api = createFriendlyGateway({ baseUrl: '', fetcher });
    await api.sendLoginCode('test@example.test');
    await api.login('test@example.test', '00123456');
    expect((fetcher.mock.calls[0][1]?.headers as Headers).get('X-Locale')).toBe('ru');
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).code).toBe(123456);
  });
});
