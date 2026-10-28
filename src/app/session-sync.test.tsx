// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderApp as render } from './render-app.test-utils';
import { App } from './App';

const key = 'friendly.session.v1';
const auth = { id: 1, token: 'test-token', accessHash: 'test-hash' };
const nextAuth = { id: 2, token: 'next-token', accessHash: 'next-hash' };

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function stubActivity(status = 200) {
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === '/activity/list')
      return status === 200
        ? new Response(JSON.stringify({ data: [], nextId: null }))
        : new Response(null, { status });
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

/** What the browser delivers to this tab when another tab of the origin changes the session. */
function otherTabWrites(value: unknown) {
  const newValue = value === null ? null : JSON.stringify(value);
  if (newValue === null) localStorage.removeItem(key);
  else localStorage.setItem(key, newValue);
  window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
}

describe('account persistence across tabs and restarts', () => {
  it('keeps the account in a new tab or after a browser restart', async () => {
    localStorage.setItem(key, JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    const fetcher = stubActivity();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    const request = fetcher.mock.calls[0]!;
    expect((request[1]?.headers as Headers).get('X-Token')).toBe(auth.token);
  });

  it('moves a session saved by the tab-scoped build instead of signing out', async () => {
    sessionStorage.setItem(key, JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    stubActivity();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(auth);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('follows sign-in and sign-out made in another tab', async () => {
    history.replaceState(null, '', '/activity');
    stubActivity();
    render(<App />);
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    act(() => otherTabWrites(auth));
    await screen.findByRole('heading', { name: 'Notifications' });
    act(() => otherTabWrites({ pendingLogout: auth }));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    // The other tab could not confirm sign-out and restored the account.
    act(() => otherTabWrites(auth));
    await screen.findByRole('heading', { name: 'Notifications' });
    act(() => otherTabWrites(null));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(screen.queryByText('Your session has ended. Please sign in again.')).toBeNull();
  });

  it('ignores a late event from another tab that no longer matches storage', async () => {
    localStorage.setItem(key, JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    stubActivity();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', { key, newValue: null, storageArea: localStorage }),
      );
    });
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
  });

  it('does not let a late 401 for an old token clear an account signed in elsewhere', async () => {
    localStorage.setItem(key, JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let reject: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = new URL(String(url)).pathname;
        const token = (options?.headers as Headers).get('X-Token');
        if (path === '/activity/list' && token === auth.token)
          return new Promise<Response>((resolve) => {
            reject = () => resolve(new Response(null, { status: 401 }));
          });
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    render(<App />);
    await waitFor(() => expect(reject).toBeDefined());
    // Simulate the old account's runtime receiving its 401 after another tab signed in.
    localStorage.setItem(key, JSON.stringify(nextAuth));
    await act(async () => reject!());
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(nextAuth);
  });
});
