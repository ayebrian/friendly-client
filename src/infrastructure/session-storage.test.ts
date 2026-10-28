// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasLegacySession, migrateLegacySession, sessionStore } from './session-storage';

const key = 'friendly.session.v2';
const legacyKey = 'friendly.session.v1';
const account = { id: 1, accessHash: 'test-hash' };
const other = { id: 2, accessHash: 'other-hash' };
const legacy = { ...account, token: 'test-legacy-token' };

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('session marker', () => {
  it('keeps only the account, shared by all tabs, and drops a leftover readable token', () => {
    sessionStorage.setItem(legacyKey, JSON.stringify(legacy));
    sessionStore.write({ ...account, token: 'must-not-be-stored' } as typeof account);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(account);
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
    expect(sessionStore.read()).toEqual({ authorization: account, pendingLogout: false });
  });

  it('ends or starts revoking only the account it was asked about', () => {
    sessionStore.write(other);
    sessionStore.clear(account);
    sessionStore.beginLogout(account);
    expect(sessionStore.read()).toEqual({ authorization: other, pendingLogout: false });
    sessionStore.beginLogout(other);
    expect(sessionStore.read()).toEqual({ authorization: other, pendingLogout: true });
    sessionStore.restoreAfterFailedLogout(other);
    expect(sessionStore.read()).toEqual({ authorization: other, pendingLogout: false });
    sessionStore.clear(other);
    expect(sessionStore.read()).toBeNull();
  });

  it('keeps the session in memory when localStorage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota', 'QuotaExceededError');
    });
    sessionStore.write(account);
    expect(sessionStore.read()).toEqual({ authorization: account, pendingLogout: false });
    vi.mocked(Storage.prototype.setItem).mockRestore();
    sessionStore.write(null);
    expect(sessionStore.read()).toBeNull();
  });
});

describe('migration of a token saved by an earlier build', () => {
  const proxy = (response: () => Promise<Response>) => vi.fn<typeof fetch>(response);

  it('hands the token to the proxy once and keeps only the account', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify(legacy));
    expect(hasLegacySession()).toBe(true);
    const fetcher = proxy(async () => new Response(JSON.stringify(account)));
    const [first, second] = await Promise.all([
      migrateLegacySession('/api', fetcher),
      migrateLegacySession('/api', fetcher),
    ]);
    expect(first).toEqual({ authorization: account, pendingLogout: false });
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('/api/_session/migrate');
    expect(options?.method).toBe('POST');
    expect(JSON.parse(String(options?.body))).toEqual({ id: 1, token: 'test-legacy-token' });
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(key)).not.toContain('test-legacy-token');
    expect(sessionStore.read()).toEqual({ authorization: account, pendingLogout: false });
  });

  it('continues a sign-out that an earlier build had started', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify({ pendingLogout: legacy }));
    const fetcher = proxy(async () => new Response(JSON.stringify(account)));
    expect(await migrateLegacySession('/api', fetcher)).toEqual({
      authorization: account,
      pendingLogout: true,
    });
    expect(sessionStore.read()).toEqual({ authorization: account, pendingLogout: true });
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
  });

  it('deletes a token that the backend rejects', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify(legacy));
    const fetcher = proxy(async () => new Response(null, { status: 401 }));
    expect(await migrateLegacySession('/api', fetcher)).toBeNull();
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
    expect(sessionStore.read()).toBeNull();
  });

  it.each([
    ['a network failure', async () => Promise.reject(new TypeError('offline'))],
    ['a server error', async () => new Response(null, { status: 502 })],
  ])('keeps the token for the next page load after %s', async (_label, response) => {
    sessionStorage.setItem(legacyKey, JSON.stringify(legacy));
    expect(await migrateLegacySession('/api', proxy(response))).toBeNull();
    expect(sessionStorage.getItem(legacyKey)).not.toBeNull();
    expect(sessionStore.read()).toBeNull();
  });

  it('ignores a malformed earlier session without calling the proxy', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify({ id: 1 }));
    const fetcher = proxy(async () => new Response(JSON.stringify(account)));
    expect(hasLegacySession()).toBe(false);
    expect(await migrateLegacySession('/api', fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
  });
});
