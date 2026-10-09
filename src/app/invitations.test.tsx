// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp as render } from './render-app.test-utils';
import { App } from './App';
import { invitationUrl } from '../shared/links';

const auth = { id: 1, token: 'test-account-token', accessHash: 'test-account-hash' };
const reference = 'add/2/test-invitation';
const invitedPath = `/invite#?reference=${encodeURIComponent(reference)}`;
const json = (data: unknown) => new Response(JSON.stringify(data));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function backend(
  accept: (options?: RequestInit) => Promise<Response> = async () => json({ type: 'Success' }),
) {
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const path = new URL(String(url)).pathname;
    if (path === '/activity/list') return json({ data: [], nextId: null });
    if (path === '/auth/email') return new Response(null);
    if (path === '/auth/login' || path === '/auth/generate') return json(auth);
    if (path === '/friends/add') return accept(options);
    if (path === '/friends/generate') return json({ token: 'test-generated-invitation' });
    if (path === '/friends/generate/force') return json({ token: 'test-replacement-invitation' });
    if (path === '/network/details') return json({ friends: [] });
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const adds = (fetcher: ReturnType<typeof backend>) =>
  fetcher.mock.calls.filter(([url]) => String(url).endsWith('/friends/add'));

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email address'), 'friend@example.test');
  await user.click(screen.getByRole('button', { name: 'Get a code' }));
  await user.type(await screen.findByLabelText('Email code'), '12345678');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

describe('public entry and real invitations', () => {
  it('opens a public landing with real account entry points and no requests or sample data', async () => {
    const fetcher = backend();
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'A little closer to your people.' })).toBeTruthy();
    expect(screen.queryByText(/demo/i)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Friendly' })).toBeTruthy();
  });

  it.each([
    invitedPath,
    `/#?reference=${encodeURIComponent(reference)}`,
    `/redirect/${encodeURIComponent(reference)}`,
    '/redirect/add/2/test-invitation',
  ])(
    'preserves %s through sign-in and a reload, then accepts only on confirmation',
    async (entry) => {
      history.replaceState(null, '', entry);
      const fetcher = backend();
      const user = userEvent.setup();
      const view = render(<App />);
      await user.click(screen.getByRole('link', { name: 'Sign in' }));
      expect(location.hash).toBe(
        new URL(invitationUrl(location.origin, 2, 'test-invitation')).hash,
      );
      view.unmount();
      render(<App />);
      await signIn(user);
      await screen.findByRole('heading', { name: 'Accept your invitation' });
      expect(location.pathname + location.hash).toBe(invitedPath);
      expect(adds(fetcher)).toHaveLength(0);
      await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
      await screen.findByText('All set. You are now friends.');
      const request = adds(fetcher)[0][1]!;
      expect(request.method).toBe('POST');
      expect(JSON.parse(String(request.body))).toEqual({ userId: 2, token: 'test-invitation' });
      expect(new Headers(request.headers).get('X-Token')).toBe(auth.token);
      expect(adds(fetcher)).toHaveLength(1);
      expect(
        (screen.getByRole('button', { name: 'Invitation accepted' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    },
  );

  it('preserves an invitation through account creation and lets the new member accept it', async () => {
    history.replaceState(null, '', invitedPath);
    const fetcher = backend();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('link', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Name'), 'New member');
    await user.type(screen.getByLabelText('About you'), 'I enjoy books and walks.');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await screen.findByRole('heading', { name: 'Accept your invitation' });
    expect(adds(fetcher)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('All set. You are now friends.');
    expect(sessionStorage.getItem('friendly.session.v1')).toContain(auth.token);
  });

  it('generates and replaces real invitations pointing back to this client', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/invite');
    const fetcher = backend();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create invitation' }));
    const input = (await screen.findByLabelText('Your link')) as HTMLInputElement;
    expect(input.value).toBe(invitationUrl(location.origin, 1, 'test-generated-invitation'));
    expect(screen.getByTitle('Friendly invitation')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Refresh invitation' }));
    await user.click(await screen.findByRole('button', { name: 'Create new' }));
    await waitFor(() =>
      expect(input.value).toBe(invitationUrl(location.origin, 1, 'test-replacement-invitation')),
    );
    expect(
      fetcher.mock.calls.some(
        ([url, options]) =>
          String(url).endsWith('/friends/generate/force') && options?.method === 'POST',
      ),
    ).toBe(true);
  });

  it('rejects malformed and own invitations without sending an add request', async () => {
    const fetcher = backend();
    const user = userEvent.setup();
    history.replaceState(null, '', '/invite#?reference=broken');
    const view = render(<App />);
    expect(screen.getByRole('heading', { name: 'This invitation is not valid' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Create account' })).toBeNull();
    view.unmount();
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/invite#?reference=add%2F1%2Ftest-own-invitation');
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('This is your own invitation. Send it to a friend.');
    expect(adds(fetcher)).toHaveLength(0);
  });

  it.each(['expired', 'offline'])(
    'keeps the invitation after an %s response and supports retry',
    async (failure) => {
      sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
      history.replaceState(null, '', invitedPath);
      let attempts = 0;
      const fetcher = backend(async () => {
        if (++attempts === 1) {
          if (failure === 'offline') throw new TypeError('Network unavailable');
          return json({ type: 'FriendTokenExpired' });
        }
        return json({ type: 'Success' });
      });
      const user = userEvent.setup();
      render(<App />);
      const input = (await screen.findByLabelText('Your friend’s link')) as HTMLInputElement;
      await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
      await screen.findByRole('alert');
      expect(input.value).toBe(reference);
      expect(screen.queryByText('All set. You are now friends.')).toBeNull();
      expect(adds(fetcher)).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
      await screen.findByText('All set. You are now friends.');
    },
  );

  it.each(['leave', 'logout'])(
    'aborts a pending invitation acceptance on %s and ignores late success',
    async (action) => {
      sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
      history.replaceState(null, '', invitedPath);
      let signal: AbortSignal | undefined;
      let finish: ((response: Response) => void) | undefined;
      backend(async (options) => {
        signal = options?.signal as AbortSignal;
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      });
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
      await waitFor(() => expect(finish).toBeDefined());
      if (action === 'leave') {
        await user.click(screen.getByRole('link', { name: 'Notifications' }));
        await screen.findByRole('heading', { name: 'Notifications' });
      } else {
        await user.click(screen.getByRole('button', { name: 'Account menu' }));
        await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
        await screen.findByRole('heading', { name: 'A friend invited you to Friendly' });
      }
      expect(signal!.aborted).toBe(true);
      await act(async () => finish!(json({ type: 'Success' })));
      expect(screen.queryByText('All set. You are now friends.')).toBeNull();
    },
  );

  it('keeps an invitation and asks for sign-in when acceptance expires the session', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', invitedPath);
    backend(async () => new Response(null, { status: 401 }));
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await screen.findByRole('heading', { name: 'A friend invited you to Friendly' });
    expect(screen.getByText('Your session has ended. Please sign in again.')).toBeTruthy();
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
    expect(location.pathname + location.hash).toBe(invitedPath);
    expect(screen.queryByRole('navigation')).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(location.hash).toBe(new URL(invitationUrl(location.origin, 2, 'test-invitation')).hash);
  });

  it('retries invitation generation and keeps the existing link after a failed replacement', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/invite');
    const fetcher = backend();
    const respond = fetcher.getMockImplementation()!;
    let failed = false;
    fetcher.mockImplementation(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/friends/generate' && !failed) {
        failed = true;
        return new Response(null, { status: 403 });
      }
      if (path === '/friends/generate/force') return new Response(null, { status: 500 });
      return respond(url, options);
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create invitation' }));
    await user.click(await screen.findByRole('button', { name: 'Retry' }));
    const input = (await screen.findByLabelText('Your link')) as HTMLInputElement;
    const original = input.value;
    await user.click(screen.getByRole('button', { name: 'Refresh invitation' }));
    await user.click(await screen.findByRole('button', { name: 'Create new' }));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect(input.value).toBe(original);
    expect(
      fetcher.mock.calls.filter(([url]) => String(url).endsWith('/friends/generate/force')),
    ).toHaveLength(1);
  });

  it('replaces the incoming invitation when navigation changes its fragment', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', invitedPath);
    const fetcher = backend();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('All set. You are now friends.');
    await act(async () => {
      history.pushState(null, '', '/invite#?reference=add%2F3%2Ftest-next-invitation');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await waitFor(() =>
      expect((screen.getByLabelText('Your friend’s link') as HTMLInputElement).value).toBe(
        'add/3/test-next-invitation',
      ),
    );
    expect(screen.queryByText('All set. You are now friends.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Accept invitation' }));
    await screen.findByText('All set. You are now friends.');
    expect(JSON.parse(String(adds(fetcher).at(-1)![1]!.body))).toEqual({
      userId: 3,
      token: 'test-next-invitation',
    });
  });
});
