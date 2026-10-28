// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { apiPath, renderApp as render } from './render-app.test-utils';
import { App } from './App';

const key = 'friendly.session.v2';
const legacyKey = 'friendly.session.v1';
const first = { id: 1, accessHash: 'first-hash' };
const second = { id: 2, accessHash: 'second-hash' };
const person = (account: typeof first, nickname: string) => ({
  user: { ...account, nickname, description: '', interests: [] },
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

/** The proxy answers for whichever account its cookie currently holds. */
function proxy() {
  const state = { cookie: first.id as number | null };
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const path = apiPath(url);
    const headers = new Headers(options?.headers);
    if (path === '/_session/migrate') {
      state.cookie = first.id;
      return new Response(JSON.stringify(first));
    }
    if (path === '/auth/email') return new Response(null);
    if (path === '/auth/login') {
      state.cookie = second.id;
      return new Response(JSON.stringify(second));
    }
    const claimed = headers.get('X-User-Id');
    if (claimed !== null && Number(claimed) !== state.cookie)
      return new Response(null, { status: 409, headers: { 'X-Friendly-Session': 'changed' } });
    if (path === '/activity/list') return new Response(JSON.stringify({ data: [], nextId: null }));
    if (path === '/feed/queue') return new Response(JSON.stringify({ entries: [] }));
    if (path === '/network/details') return new Response(JSON.stringify({ friends: [] }));
    if (path === '/users/details2')
      return new Response(
        JSON.stringify(
          state.cookie === first.id ? person(first, 'First account') : person(second, 'Second'),
        ),
      );
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, state };
}

function otherTabWrites(value: unknown) {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
}

describe('cookie session shared by tabs', () => {
  it('moves a token saved by an earlier build into the proxy cookie on first load', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify({ ...first, token: 'test-legacy-token' }));
    history.replaceState(null, '', '/activity');
    const { fetcher } = proxy();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Restoring your session…' })).toBeTruthy();
    await screen.findByRole('heading', { name: 'Notifications' });
    expect(apiPath(fetcher.mock.calls[0][0])).toBe('/_session/migrate');
    expect(fetcher.mock.calls.filter(([url]) => apiPath(url) === '/_session/migrate')).toHaveLength(
      1,
    );
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(first);
    for (const [url, options] of fetcher.mock.calls.slice(1)) {
      expect(String(url).startsWith('/api/')).toBe(true);
      expect(new Headers(options?.headers).get('X-Token')).toBeNull();
      expect(new Headers(options?.headers).get('X-User-Id')).toBe(String(first.id));
    }
  });

  it('starts signed out when the earlier token is rejected', async () => {
    sessionStorage.setItem(legacyKey, JSON.stringify({ ...first, token: 'test-revoked-token' }));
    history.replaceState(null, '', '/activity');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => new Response(null, { status: 401 })),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(sessionStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('keeps no readable token after signing in', async () => {
    history.replaceState(null, '', '/activity');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        const path = apiPath(url);
        if (path === '/auth/email') return new Response(null);
        // Even if a token slipped through, the client must not keep it.
        if (path === '/auth/login')
          return new Response(JSON.stringify({ ...first, token: 'test-slipped-token' }));
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Email address'), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await user.type(await screen.findByLabelText('Email code'), '12345678');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Notifications' });
    const stored = [localStorage, sessionStorage].flatMap((storage) =>
      Object.keys(storage).map((name) => storage.getItem(name)),
    );
    expect(stored.join('\n')).not.toContain('test-slipped-token');
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(first);
  });

  it('follows sign-in and sign-out made in another tab', async () => {
    localStorage.setItem(key, JSON.stringify(first));
    history.replaceState(null, '', '/profile');
    const { state } = proxy();
    render(<App />);
    await screen.findByRole('heading', { name: 'First account' });
    state.cookie = second.id;
    act(() => otherTabWrites(second));
    await screen.findByRole('heading', { name: 'Second' });
    expect(screen.queryByText('First account')).toBeNull();
    state.cookie = null;
    act(() => otherTabWrites(null));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
  });

  it('switches to the account the cookie now holds when the proxy reports a change', async () => {
    localStorage.setItem(key, JSON.stringify(first));
    history.replaceState(null, '', '/profile');
    const { state } = proxy();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'First account' });
    // Another tab signed in to a different account, and this tab missed the storage event.
    state.cookie = second.id;
    localStorage.setItem(key, JSON.stringify(second));
    await user.click(screen.getByRole('link', { name: 'People' }));
    await waitFor(() => expect(location.pathname).toBe('/people'));
    await user.click(await screen.findByRole('link', { name: 'My profile' }));
    await screen.findByRole('heading', { name: 'Second' });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(second);
  });

  it('ends the tab session when the proxy reports a change it cannot follow', async () => {
    localStorage.setItem(key, JSON.stringify(first));
    history.replaceState(null, '', '/profile');
    const { state } = proxy();
    state.cookie = second.id;
    render(<App />);
    await screen.findByText('You signed in to another account in a different tab.');
    expect(screen.getByRole('heading', { name: 'Sign in to Friendly' })).toBeTruthy();
    expect(localStorage.getItem(key)).toBeNull();
  });
});
