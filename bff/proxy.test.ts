import { describe, expect, it, vi } from 'vitest';
import { handleApiRequest, readSessions, SESSION_COOKIE_PREFIX } from './proxy';
import { onRequest } from '../functions/api/[[path]]';
import { createFriendlyGateway } from '../src/infrastructure/friendly-gateway';

const origin = 'https://friendly.example';
const api = 'https://api.example';
const env = { FRIENDLY_API_ORIGIN: api };
const account = { id: 42, accessHash: 'account-hash' };
const secret = 'test-secret-token';

function cookieFor(id: number, token: string) {
  const value = btoa(JSON.stringify({ id, token }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${SESSION_COOKIE_PREFIX}${id}=${value}`;
}
const signedIn = { Cookie: `theme=dark; ${cookieFor(42, secret)}` };

function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const method = init.method ?? 'GET';
  const headers = { ...(method === 'GET' || method === 'HEAD' ? {} : { Origin: origin }) };
  return new Request(`${origin}${path}`, {
    ...init,
    headers: { ...headers, ...init.headers },
    ...(init.body ? { duplex: 'half' } : {}),
  } as RequestInit);
}

function upstream(response: () => Response | Promise<Response>) {
  return vi.fn<typeof fetch>(async () => response());
}

function sent(fetcher: ReturnType<typeof upstream>, index = 0) {
  return fetcher.mock.calls[index][0] as Request;
}

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const SAFE = new Set(['GET', 'HEAD']);

describe('sign-in', () => {
  it.each(['/auth/login', '/auth/generate'])(
    'moves the token from %s into an HttpOnly __Host- cookie',
    async (path) => {
      const fetcher = upstream(() => json({ ...account, token: secret }));
      const response = await handleApiRequest(
        request(`/api${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@example.test', code: 12345678 }),
        }),
        env,
        { fetch: fetcher },
      );
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(JSON.parse(text)).toEqual(account);
      const cookie = response.headers.get('Set-Cookie')!;
      expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE_PREFIX}42=[A-Za-z0-9_-]+;`));
      expect(cookie).not.toContain(secret);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Secure');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toMatch(/Domain=/i);
      expect(readSessions(cookie.split(';')[0])).toEqual([{ id: 42, token: secret }]);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      const forwarded = sent(fetcher);
      expect(forwarded.url).toBe(`${api}${path}`);
      expect(forwarded.headers.get('X-Token')).toBeNull();
      expect(await forwarded.json()).toEqual({ email: 'test@example.test', code: 12345678 });
    },
  );

  it('removes the cookies of other accounts and keeps unrelated cookies', async () => {
    const fetcher = upstream(() => json({ ...account, token: secret }));
    const response = await handleApiRequest(
      request('/api/auth/login', {
        method: 'POST',
        headers: { Cookie: `theme=dark; ${cookieFor(7, 'test-other-token')}` },
        body: '{}',
      }),
      env,
      { fetch: fetcher },
    );
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(new RegExp(`^${SESSION_COOKIE_PREFIX}42=[A-Za-z0-9_-]+;`));
    expect(cookies[1]).toMatch(new RegExp(`^${SESSION_COOKIE_PREFIX}7=; Max-Age=0;`));
  });

  it('passes a failed sign-in through without a cookie', async () => {
    const fetcher = upstream(() => new Response(null, { status: 403 }));
    const response = await handleApiRequest(
      request('/api/auth/login', { method: 'POST', body: '{}' }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('refuses a successful sign-in response without a token', async () => {
    const fetcher = upstream(() => json(account));
    const response = await handleApiRequest(
      request('/api/auth/login', { method: 'POST', body: '{}' }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('path canonicalization', () => {
  // The fake backend answers every path like a sign-in, so a forwarded request would leak it.
  const leaky = () => upstream(() => json({ ...account, token: secret }));
  const signInBody = { headers: { 'Content-Type': 'application/json' }, body: '{}' };

  it.each([
    '/api/auth/login/',
    '/api/auth//login',
    '/api//auth/login',
    '/api/Auth/Login',
    '/api/AUTH/LOGIN',
    '/api/auth/Generate',
    '/api/auth/%6cogin',
    '/api/%61uth/login',
    '/api/auth%2Flogin',
    '/api/auth%2flogin',
    '/api/auth/login%2F',
    '/api/auth/login%00',
    '/api/auth/login;jsessionid=1',
    '/api/auth/generate/',
    '/api/auth/generate//',
    '/api/auth/%67enerate',
  ])('rejects POST %s with 400 without calling the backend', async (path) => {
    const fetcher = leaky();
    const response = await handleApiRequest(request(path, { method: 'POST', ...signInBody }), env, {
      fetch: fetcher,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_path' });
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'])(
    'refuses %s on the sign-in paths with 405 without calling the backend',
    async (method) => {
      for (const path of [
        '/api/auth/login',
        '/api/auth/login?email=test@example.test&code=1',
        '/api/auth/generate',
        '/api/auth/generate?nickname=x',
      ]) {
        const fetcher = leaky();
        const response = await handleApiRequest(
          request(path, { method, ...(SAFE.has(method) ? {} : signInBody) }),
          env,
          { fetch: fetcher },
        );
        expect(response.status).toBe(405);
        expect(await response.text()).not.toContain(secret);
        expect(response.headers.get('Set-Cookie')).toBeNull();
        expect(fetcher).not.toHaveBeenCalled();
      }
    },
  );

  it.each([
    '/api/auth/login?next=1',
    '/api/auth/./login',
    '/api/auth/x/../login',
    '/api/auth/%2e/login',
    '/api/x/%2E%2E/auth/generate',
    '/api/auth\\login',
  ])('treats %s, which the URL parser resolves to a sign-in path, as a sign-in', async (path) => {
    const fetcher = leaky();
    const response = await handleApiRequest(request(path, { method: 'POST', ...signInBody }), env, {
      fetch: fetcher,
    });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toEqual(account);
    expect(response.headers.get('Set-Cookie')).toMatch(
      new RegExp(`^${SESSION_COOKIE_PREFIX}42=[A-Za-z0-9_-]+;`),
    );
  });

  it('rejects percent-encoding, empty segments and session namespace variants anywhere', async () => {
    const fetcher = leaky();
    for (const path of [
      '/api/community/list/a%2Fb',
      '/api/users/details2/42/hash%20x',
      '/api/feed/queue/',
      '/api/feed//queue',
      '/api/_Session/migrate',
      '/api/_SESSION/other',
      '/api/users/details2/42/a:b',
      '/api/users/details2/42/a@b',
    ]) {
      const response = await handleApiRequest(request(path, { headers: signedIn }), env, {
        fetch: fetcher,
      });
      expect(response.status, path).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects sign-out and migration variants without touching the cookie', async () => {
    const fetcher = leaky();
    for (const path of [
      '/api/auth/logout/',
      '/api/Auth/Logout',
      '/api/auth/%6cogout',
      '/api/_session/migrate/',
      '/api/_Session/Migrate',
    ]) {
      const response = await handleApiRequest(
        request(path, { method: 'POST', headers: { ...signedIn, 'X-User-Id': '42' }, body: '{}' }),
        env,
        { fetch: fetcher },
      );
      expect(response.status, path).toBe(400);
      expect(response.headers.get('Set-Cookie'), path).toBeNull();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('rejects a malformed path before the Origin check without calling the backend', async () => {
    const fetcher = leaky();
    const response = await handleApiRequest(
      request('/api/auth/login/', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: '{}',
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain(secret);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still forwards ids and mixed-case access hashes outside the reserved namespaces', async () => {
    const fetcher = upstream(() => json({}));
    const hash = 'AbC.d~e_f-G9';
    const response = await handleApiRequest(
      request(`/api/users/details2/42/${hash}`, { headers: { ...signedIn, 'X-User-Id': '42' } }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(200);
    expect(sent(fetcher).url).toBe(`${api}/users/details2/42/${hash}`);
  });

  it('passes an invite token from /friends/generate through unchanged', async () => {
    const fetcher = upstream(() => json({ token: 'invite-token' }));
    const response = await handleApiRequest(
      request('/api/friends/generate', {
        method: 'POST',
        headers: { ...signedIn, 'X-User-Id': '42' },
        body: '{}',
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token: 'invite-token' });
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('authenticated proxying', () => {
  it('adds the backend headers from the cookie and forwards only allowed headers', async () => {
    const fetcher = upstream(() =>
      json(
        { ok: true },
        {
          status: 201,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': 'upstream=1',
            'Access-Control-Allow-Origin': '*',
            'Retry-After': '5',
          },
        },
      ),
    );
    const response = await handleApiRequest(
      request('/api/community/list/123?x=1', {
        headers: {
          ...signedIn,
          'X-User-Id': '42',
          'X-Locale': 'ru',
          'X-Compatible': 'true',
          Authorization: 'Bearer leaked',
          'X-Token': 'client-supplied',
          'CF-Connecting-IP': '203.0.113.1',
        },
      }),
      env,
      { fetch: fetcher },
    );
    const forwarded = sent(fetcher);
    expect(forwarded.url).toBe(`${api}/community/list/123?x=1`);
    expect(forwarded.headers.get('X-Token')).toBe(secret);
    expect(forwarded.headers.get('X-User-Id')).toBe('42');
    expect(forwarded.headers.get('X-Locale')).toBe('ru');
    expect(forwarded.headers.get('X-Compatible')).toBe('true');
    expect(forwarded.headers.get('Cookie')).toBeNull();
    expect(forwarded.headers.get('Authorization')).toBeNull();
    expect(forwarded.headers.get('CF-Connecting-IP')).toBeNull();
    expect(forwarded.redirect).toBe('manual');
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('streams multipart uploads with the file size header', async () => {
    const fetcher = upstream(() => json({ id: 7, accessHash: 'file-hash' }));
    const form = new FormData();
    form.append('file', new Blob(['image-bytes'], { type: 'image/png' }), 'photo.png');
    const body = new Request('https://form.example', { method: 'POST', body: form });
    const response = await handleApiRequest(
      request('/api/files/upload', {
        method: 'POST',
        headers: {
          ...signedIn,
          'X-User-Id': '42',
          'X-File-Size': '11',
          'Content-Type': body.headers.get('Content-Type')!,
        },
        body: body.body,
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(200);
    const forwarded = sent(fetcher);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('X-File-Size')).toBe('11');
    const received = await forwarded.formData();
    expect(await (received.get('file') as File).text()).toBe('image-bytes');
  });

  it('never attaches the token unless the client names the signed-in account', async () => {
    const fetcher = upstream(() => new Response(null, { status: 401 }));
    const response = await handleApiRequest(
      request('/api/users/details2', { headers: signedIn }),
      env,
      {
        fetch: fetcher,
      },
    );
    expect(sent(fetcher).headers.get('X-Token')).toBeNull();
    expect(response.status).toBe(401);
    // An anonymous 401 must not end the session that the page did not use.
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('answers 401 without calling the backend when there is no session cookie', async () => {
    const fetcher = upstream(() => json({}));
    const response = await handleApiRequest(
      request('/api/activity/list', {
        headers: { 'X-User-Id': '42', Cookie: `${SESSION_COOKIE_PREFIX}42=%%%` },
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses only the cookie of the account the client names', async () => {
    const fetcher = upstream(() => json({}));
    const cookies = { Cookie: `${cookieFor(7, 'test-other-token')}; ${cookieFor(42, secret)}` };
    await handleApiRequest(
      request('/api/activity/list', { headers: { ...cookies, 'X-User-Id': '7' } }),
      env,
      { fetch: fetcher },
    );
    expect(sent(fetcher).headers.get('X-Token')).toBe('test-other-token');
    expect(sent(fetcher).headers.get('X-User-Id')).toBe('7');
    const response = await handleApiRequest(
      request('/api/activity/list', { headers: { ...signedIn, 'X-User-Id': '7' } }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('ignores a cookie whose name does not match the account inside it', async () => {
    const fetcher = upstream(() => json({}));
    const forged = cookieFor(42, secret).replace(
      `${SESSION_COOKIE_PREFIX}42=`,
      `${SESSION_COOKIE_PREFIX}7=`,
    );
    const response = await handleApiRequest(
      request('/api/activity/list', { headers: { Cookie: forged, 'X-User-Id': '7' } }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clears the cookie when the backend rejects the token', async () => {
    const fetcher = upstream(() => new Response(null, { status: 401 }));
    const response = await handleApiRequest(
      request('/api/activity/list', { headers: { ...signedIn, 'X-User-Id': '42' } }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toMatch(
      new RegExp(
        `^${SESSION_COOKIE_PREFIX}42=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict$`,
      ),
    );
  });

  it('reports an unreachable backend as 502', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network'));
    const response = await handleApiRequest(request('/api/feed/queue'), env, { fetch: fetcher });
    expect(response.status).toBe(502);
  });

  it('keeps every request on the configured API origin', async () => {
    const fetcher = upstream(() => json({}));
    const outside = await handleApiRequest(request('/api//evil.example/x'), env, {
      fetch: fetcher,
    });
    expect(outside.status).toBe(400);
    await handleApiRequest(request('/api/../../x'), env, { fetch: fetcher });
    for (const [input] of fetcher.mock.calls)
      expect(new URL((input as Request).url).origin).toBe(api);
  });

  it('defaults to the public Friendly API and rejects an insecure configuration', async () => {
    const fetcher = upstream(() => json({}));
    await handleApiRequest(request('/api/feed/queue'), {}, { fetch: fetcher });
    expect(sent(fetcher).url).toBe('https://api.getfriend.ly/feed/queue');
    const response = await handleApiRequest(
      request('/api/feed/queue'),
      { FRIENDLY_API_ORIGIN: 'http://api.example' },
      { fetch: fetcher },
    );
    expect(response.status).toBe(500);
  });

  it('serves only paths below /api and known methods', async () => {
    const fetcher = upstream(() => json({}));
    expect((await handleApiRequest(request('/api'), env, { fetch: fetcher })).status).toBe(404);
    expect((await handleApiRequest(request('/api/'), env, { fetch: fetcher })).status).toBe(404);
    expect(
      (await handleApiRequest(request('/api/_session/other'), env, { fetch: fetcher })).status,
    ).toBe(404);
    expect(
      (
        await handleApiRequest(request('/api/feed/queue', { method: 'OPTIONS' }), env, {
          fetch: fetcher,
        })
      ).status,
    ).toBe(405);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('sign-out', () => {
  it('clears the cookie after the backend revokes the token', async () => {
    const fetcher = upstream(() => json({}));
    const response = await handleApiRequest(
      request('/api/auth/logout', { method: 'POST', headers: { ...signedIn, 'X-User-Id': '42' } }),
      env,
      { fetch: fetcher },
    );
    expect(sent(fetcher).url).toBe(`${api}/auth/logout`);
    expect(sent(fetcher).headers.get('X-Token')).toBe(secret);
    expect(response.status).toBe(200);
    expect(response.headers.get('Set-Cookie')).toMatch(/Max-Age=0/);
  });

  it('ends only the signed-out account when the response arrives after another sign-in', async () => {
    const fetcher = upstream(() => json({}));
    // Account 7 signed in from another tab while the sign-out of 42 was in flight.
    const response = await handleApiRequest(
      request('/api/auth/logout', {
        method: 'POST',
        headers: {
          Cookie: `${cookieFor(42, secret)}; ${cookieFor(7, 'test-other-token')}`,
          'X-User-Id': '42',
        },
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.headers.getSetCookie()).toEqual([
      `${SESSION_COOKIE_PREFIX}42=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict`,
    ]);
  });

  it('keeps the cookie when the backend could not revoke the token', async () => {
    const fetcher = upstream(() => new Response(null, { status: 500 }));
    const response = await handleApiRequest(
      request('/api/auth/logout', { method: 'POST', headers: { ...signedIn, 'X-User-Id': '42' } }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('cross-site requests', () => {
  it.each([
    ['without Origin', {}],
    ['from another origin', { Origin: 'https://attacker.example' }],
    ['from a lookalike origin', { Origin: `${origin}.attacker.example` }],
    ['from a null origin', { Origin: 'null' }],
  ])('rejects a state-changing request %s', async (_label, headers) => {
    const fetcher = upstream(() => json({}));
    for (const path of ['/api/community', '/api/auth/login', '/api/_session/migrate']) {
      const response = await handleApiRequest(
        new Request(`${origin}${path}`, {
          method: 'POST',
          headers: { ...signedIn, 'X-User-Id': '42', ...headers },
          body: '{}',
        }),
        env,
        { fetch: fetcher },
      );
      expect(response.status).toBe(403);
      expect(response.headers.get('Set-Cookie')).toBeNull();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('migration of a token from an earlier build', () => {
  it('checks the token with the backend, then stores it only in the cookie', async () => {
    const fetcher = upstream(() => json({ user: { ...account, nickname: 'Test' } }));
    const response = await handleApiRequest(
      request('/api/_session/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 42, token: secret }),
      }),
      env,
      { fetch: fetcher },
    );
    expect(sent(fetcher).url).toBe(`${api}/users/details2`);
    expect(sent(fetcher).headers.get('X-Token')).toBe(secret);
    expect(sent(fetcher).headers.get('X-User-Id')).toBe('42');
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toEqual(account);
    expect(readSessions(response.headers.get('Set-Cookie')!.split(';')[0])).toEqual([
      { id: 42, token: secret },
    ]);
  });

  it('leaves the cookie of an account that signed in meanwhile alone', async () => {
    const fetcher = upstream(() => json({ user: account }));
    const response = await handleApiRequest(
      request('/api/_session/migrate', {
        method: 'POST',
        headers: { Cookie: cookieFor(7, 'test-other-token') },
        body: JSON.stringify({ id: 42, token: secret }),
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.headers.getSetCookie()).toHaveLength(1);
    expect(response.headers.get('Set-Cookie')).toMatch(new RegExp(`^${SESSION_COOKIE_PREFIX}42=`));
  });

  it('stops reading an oversized streamed body at the limit', async () => {
    const fetcher = upstream(() => json({}));
    let pulled = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1024;
        if (pulled > 1024 * 1024) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const response = await handleApiRequest(
      request('/api/_session/migrate', { method: 'POST', body }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(16 * 1024);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not store a token that the backend rejects', async () => {
    const fetcher = upstream(() => new Response(null, { status: 401 }));
    const response = await handleApiRequest(
      request('/api/_session/migrate', {
        method: 'POST',
        body: JSON.stringify({ id: 42, token: 'x' }),
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not store a token that belongs to another account', async () => {
    const fetcher = upstream(() => json({ user: { id: 7, accessHash: 'other' } }));
    const response = await handleApiRequest(
      request('/api/_session/migrate', {
        method: 'POST',
        body: JSON.stringify({ id: 42, token: 'x' }),
      }),
      env,
      { fetch: fetcher },
    );
    expect(response.status).toBe(502);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it.each([
    ['malformed JSON', '{'],
    ['a missing token', JSON.stringify({ id: 42 })],
    ['a fractional id', JSON.stringify({ id: 4.2, token: 'x' })],
    ['an oversized body', JSON.stringify({ id: 42, token: 'x'.repeat(5000) })],
  ])('rejects %s without calling the backend', async (_label, body) => {
    const fetcher = upstream(() => json({}));
    const response = await handleApiRequest(
      request('/api/_session/migrate', { method: 'POST', body }),
      env,
      { fetch: fetcher },
    );
    expect([400, 413]).toContain(response.status);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Pages Function entry', () => {
  it('passes the environment to the proxy', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({}));
    await onRequest({ request: request('/api/feed/queue'), env });
    expect((fetcher.mock.calls[0][0] as Request).url).toBe(`${api}/feed/queue`);
    fetcher.mockRestore();
  });
});

describe('client routes', () => {
  it('serves every request the gateway sends without rejecting its path', async () => {
    // Real identifiers: numeric ids and cursors, 256-character access hashes.
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-.~';
    const hash = Array.from({ length: 256 }, (_, i) => alphabet[(i * 7) % alphabet.length]).join(
      '',
    );
    const backend = upstream(() => json({ ...account, token: secret }));
    const statuses: number[] = [];
    const gateway = createFriendlyGateway({
      baseUrl: '/api',
      userId: 42,
      fetcher: async (input, init) => {
        const method = init?.method ?? 'GET';
        const headers = new Headers(init?.headers);
        headers.set('Cookie', signedIn.Cookie);
        if (!SAFE.has(method)) headers.set('Origin', origin);
        const response = await handleApiRequest(
          new Request(`${origin}${String(input)}`, { ...init, headers }),
          env,
          { fetch: backend },
        );
        statuses.push(response.status);
        return response;
      },
    });
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    const calls: (() => Promise<unknown>)[] = [
      () => gateway.sendLoginCode('test@example.test'),
      () => gateway.login('test@example.test', '12345678'),
      () => gateway.register({ nickname: 'n', description: 'd', interests: [] } as never),
      () => gateway.profile(),
      () => gateway.person(7, hash),
      () => gateway.editProfile({ nickname: 'n' } as never),
      () => gateway.uploadAvatar(file, true),
      () => gateway.uploadAvatar(file, false),
      () => gateway.uploadMedia(file),
      () => gateway.friends(),
      () => gateway.discover(),
      () => gateway.requestFriend(7, hash),
      () => gateway.declineFriend(7, hash),
      () => gateway.invitation(false),
      () => gateway.invitation(true),
      () => gateway.acceptInvitation(7, 'invite-token'),
      () => gateway.linkEmail('test@example.test'),
      () => gateway.confirmEmail('123456'),
      () => gateway.unlinkEmail(),
      () => gateway.registerPush('push-token'),
      () => gateway.posts(null),
      () => gateway.posts('123'),
      () => gateway.publish('text'),
      () => gateway.editPost(5, 'text'),
      () => gateway.deletePost(5),
      () => gateway.activityPage(null),
      () => gateway.activityPage('123'),
      () => gateway.readActivity(9),
      () => gateway.thread(5, hash),
      () => gateway.replies(5, hash, null),
      () => gateway.replies(5, hash, '123'),
      () => gateway.logout(),
    ];
    // The fake backend's answer does not fit most schemas; only the routing matters here.
    for (const call of calls) await call().catch(() => {});
    expect(statuses).toHaveLength(calls.length);
    expect(statuses.filter((status) => [400, 403, 405].includes(status))).toEqual([]);
    expect(backend).toHaveBeenCalledTimes(calls.length);
    expect(backend.mock.calls.map(([input]) => new URL((input as Request).url).pathname)).toContain(
      `/community/5/${hash}/replies2`,
    );
  });
});
