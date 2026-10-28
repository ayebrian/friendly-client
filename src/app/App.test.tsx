// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderFixtureApp, renderApp as render } from './render-app.test-utils';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { StrictMode } from 'react';
import activity from '../infrastructure/fixtures/activity-list.json?raw';

// jsdom has no pointer capture; Sonner uses the browser API for swipe dismissal.
beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value() {} },
    releasePointerCapture: { configurable: true, value() {} },
    hasPointerCapture: {
      configurable: true,
      value() {
        return false;
      },
    },
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const owner = { id: 2, nickname: 'Тестовый автор', description: '', interests: [] };
const event = {
  id: 1,
  type: 'new_reply',
  instant: '2026-09-30T12:00:00Z',
  isRead: false,
  post: {
    id: 10,
    accessHash: 'hash',
    text: 'Тестовый ответ',
    owner,
    instant: '2026-09-30T12:00:00Z',
  },
};
const auth = { id: 1, token: 'test-token', accessHash: 'test-hash' };

describe('session and notification integration', () => {
  it('revokes the server token before clearing the local session on sign out', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let finishLogout: ((response: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/activity/list')
        return new Response(JSON.stringify({ data: [], nextId: null }));
      if (path === '/auth/logout')
        return new Promise<Response>((resolve) => {
          finishLogout = resolve;
        });
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(finishLogout).toBeDefined());
    expect(JSON.parse(localStorage.getItem('friendly.session.v1')!)).toEqual({
      pendingLogout: auth,
    });
    expect(screen.getByRole('heading', { name: 'Signing out…' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    await act(async () => finishLogout!(new Response('{}')));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(localStorage.getItem('friendly.session.v1')).toBeNull();
    const request = fetcher.mock.calls.find(([url]) => String(url).endsWith('/auth/logout'))!;
    expect(request[1]?.method).toBe('POST');
    expect((request[1]?.headers as Headers).get('X-Token')).toBe(auth.token);
    expect((request[1]?.headers as Headers).get('X-User-Id')).toBe(String(auth.id));
  });

  it('aborts account requests as soon as sign out starts, while revocation is pending', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let activitySignal: AbortSignal | undefined;
    let finishLogout: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list') {
          activitySignal = options?.signal as AbortSignal;
          return new Promise<Response>(() => {});
        }
        if (path === '/auth/logout')
          return new Promise<Response>((resolve) => {
            finishLogout = resolve;
          });
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(activitySignal).toBeDefined());
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(finishLogout).toBeDefined());
    expect(activitySignal!.aborted).toBe(true);
    expect(screen.getByRole('heading', { name: 'Signing out…' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'New post' })).toBeNull();
    expect(localStorage.getItem('friendly.session.v1')).not.toBeNull();
    await act(async () => finishLogout!(new Response('{}')));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
  });

  it('resumes a pending server sign out after a same-tab reload', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let revokeCount = 0;
    let finishFirst: ((response: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === '/activity/list')
        return new Response(JSON.stringify({ data: [], nextId: null }));
      if (path === '/auth/logout') {
        revokeCount++;
        if (revokeCount === 1)
          return new Promise<Response>((resolve) => {
            finishFirst = resolve;
          });
        return new Response('{}');
      }
      throw new Error(`Unexpected endpoint: ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    const first = render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(finishFirst).toBeDefined());
    expect(JSON.parse(localStorage.getItem('friendly.session.v1')!)).toEqual({
      pendingLogout: auth,
    });
    first.unmount();

    render(<App />);
    expect(screen.getByRole('heading', { name: 'Signing out…' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(revokeCount).toBe(2);
    expect(localStorage.getItem('friendly.session.v1')).toBeNull();
    for (const [, options] of fetcher.mock.calls.filter(([url]) =>
      String(url).endsWith('/auth/logout'),
    )) {
      expect((options?.headers as Headers).get('X-Token')).toBe(auth.token);
    }
    await act(async () => finishFirst!(new Response('{}')));
    expect(screen.getByRole('heading', { name: 'Sign in to Friendly' })).toBeTruthy();
  });

  it('does not let an old pending revoke clear a later account', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let finishLogout: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        if (path === '/auth/logout')
          return new Promise<Response>((resolve) => {
            finishLogout = resolve;
          });
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    const first = render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(finishLogout).toBeDefined());
    first.unmount();
    const nextAuth = { id: 2, token: 'next-token', accessHash: 'next-hash' };
    localStorage.setItem('friendly.session.v1', JSON.stringify(nextAuth));
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await act(async () => finishLogout!(new Response('{}')));
    expect(JSON.parse(localStorage.getItem('friendly.session.v1')!)).toEqual(nextAuth);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
  });

  it('keeps the session available after a failed revoke, then retries sign out', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    let attempts = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        if (path === '/auth/logout') {
          if (++attempts === 1) throw new TypeError('Network unavailable');
          return new Response('{}');
        }
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByText(/Could not confirm sign-out. This account is still open in this tab./);
    expect(JSON.parse(localStorage.getItem('friendly.session.v1')!)).toEqual(auth);
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(attempts).toBe(2);
    expect(localStorage.getItem('friendly.session.v1')).toBeNull();
  });

  it('clears the local session when the revoke endpoint reports an already invalid token', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        if (path === '/auth/logout') return new Response(null, { status: 401 });
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole('heading', { name: 'Notifications' });
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(localStorage.getItem('friendly.session.v1')).toBeNull();
    expect(screen.queryByText('Your session has ended. Please sign in again.')).toBeNull();
  });

  it.each(['code', 'login'] as const)(
    'cancels a pending %s request and ignores its late response after leaving sign-in',
    async (stage) => {
      let finish: ((response: Response) => void) | undefined;
      let requestSignal: AbortSignal | undefined;
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>(async (url, options) => {
          const path = new URL(String(url)).pathname;
          const delayed = stage === 'code' ? '/auth/email' : '/auth/login';
          if (path === delayed) {
            requestSignal = options?.signal as AbortSignal;
            // Deliberately resolve after abort, as a response may already be queued.
            return new Promise<Response>((resolve) => {
              finish = resolve;
            });
          }
          if (path === '/auth/email') return new Response(null);
          if (path === '/activity/list')
            return new Response(JSON.stringify({ data: [], nextId: null }));
          throw new Error('Unexpected endpoint');
        }),
      );
      const user = userEvent.setup();
      history.replaceState(null, '', '/activity');
      render(<App />);
      await user.type(screen.getByLabelText('Email address'), 'test@example.test');
      await user.click(screen.getByRole('button', { name: 'Get a code' }));
      if (stage === 'login') {
        await user.type(await screen.findByLabelText('Email code'), '12345678');
        await user.click(screen.getByRole('button', { name: 'Sign in' }));
      }
      await waitFor(() => expect(finish).toBeDefined());
      await user.click(screen.getByRole('link', { name: 'Create account' }));
      const name = await screen.findByLabelText('Name');
      await user.type(name, 'Registration in progress');
      expect(requestSignal!.aborted).toBe(true);
      await act(async () => finish!(new Response(JSON.stringify(auth))));
      expect(location.pathname).toBe('/signup');
      expect((name as HTMLInputElement).value).toBe('Registration in progress');
      expect(localStorage.getItem('friendly.session.v1')).toBeNull();
      expect(screen.queryByRole('navigation')).toBeNull();
    },
  );

  it('renders replies, followed-thread replies and friend requests from the backend', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        if (new URL(String(url)).pathname === '/activity/list') return new Response(activity);
        throw new Error('unexpected endpoint');
      }),
    );
    render(<App />);
    await screen.findByText('Who is up for a hike on Saturday?');
    const text = [...document.querySelectorAll('.activity-row')].map((row) => row.textContent);
    expect(text).toHaveLength(4);
    expect(text[0]).toContain('Annasent you a friend request');
    expect(text[1]).toContain('Borisaccepted your friend request');
    expect(text[1]).toContain('You are friends now.');
    expect(text[2]).toContain('New repliesin a thread byVera');
    expect(text[2]).toContain('Who is up for a hike on Saturday?');
    expect(text[3]).toContain('Verareplied to your post');
    expect(screen.queryByText(/not supported by the app/)).toBeNull();
    const href = (name: string) => screen.getByRole('link', { name }).getAttribute('href');
    expect(href('Respond')).toBe('/people/31/anna-hash');
    expect(href('Open profile')).toBe('/people/32/boris-hash');
    expect(href('Open replies')).toBe('/post/122/branch-hash');
    expect(href('Open reply')).toBe('/post/110/reply-hash');
    await waitFor(() => expect(document.title).toBe('(3) Friendly'));
  });
  it('refreshes notifications after accepting a friend request from one', async () => {
    const anna = {
      id: 31,
      accessHash: 'anna-hash',
      nickname: 'Anna',
      description: '',
      interests: [],
      friendship: 'incomingRequest',
    };
    let accepted = false;
    const request = () => ({
      id: 7,
      type: 'new_request',
      instant: '2026-10-25T18:04:11Z',
      isRead: accepted,
      from: { ...anna, friendship: accepted ? 'friends' : 'incomingRequest' },
      isMutual: false,
    });
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/activity');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [request()], nextId: null }));
        if (path === '/users/details2/31/anna-hash')
          return new Response(JSON.stringify({ user: request().from, commonFriends: [] }));
        if (path === '/friends/request' && options?.method === 'POST') {
          accepted = true;
          return new Response(null);
        }
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(document.title).toBe('(1) Friendly'));
    await user.click(await screen.findByRole('link', { name: 'Respond' }));
    await user.click(await screen.findByRole('button', { name: 'Accept request' }));
    await waitFor(() => expect(document.title).toBe('Friendly'));
  });
  it('polls activity on a different page without enabling push', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let events = [event];
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/profile');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        if (String(url).endsWith('/activity/list'))
          return new Response(JSON.stringify({ data: events, nextId: null }));
        if (String(url).endsWith('/users/details2'))
          return new Response(JSON.stringify({ user: owner }));
        throw new Error('unexpected endpoint');
      }),
    );
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Тестовый автор' });
    await waitFor(() => expect(document.title).toBe('(1) Friendly'));
    events = [{ ...event, id: 2 }, event];
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await waitFor(() => expect(document.title).toBe('(2) Friendly'));
    await screen.findByText('New reply');
  });
  it('restores unread status and badge after a failed read', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/activity/read/')) return new Response(null, { status: 500 });
      if (String(url).endsWith('/activity/list'))
        return new Response(JSON.stringify({ data: [event], nextId: null }));
      throw new Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    history.replaceState(null, '', '/activity');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByText('Тестовый ответ');
    await user.click(screen.getByRole('button', { name: 'Mark as read' }));
    await screen.findByRole('alert');
    await waitFor(() => expect(document.title).toBe('(1) Friendly'));
    expect(screen.getByText('New')).toBeTruthy();
  });

  it('expires session and removes account cache on authenticated 401', async () => {
    localStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
    );
    history.replaceState(null, '', '/activity');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(localStorage.getItem('friendly.session.v1')).toBeNull();
    expect(screen.getByText('Your session has ended. Please sign in again.')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('signs in through email code endpoints and opens the authenticated list', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/email')) return new Response(null);
      if (String(url).endsWith('/auth/login')) return new Response(JSON.stringify(auth));
      if (String(url).endsWith('/activity/list'))
        return new Response(JSON.stringify({ data: [event], nextId: null }));
      throw new Error('unexpected endpoint');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    history.replaceState(null, '', '/activity');
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await user.type(screen.getByLabelText('Email address'), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await user.type(await screen.findByLabelText(/Email code/), '12345678');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Тестовый ответ');
    expect(JSON.parse(localStorage.getItem('friendly.session.v1')!)).toEqual(auth);
  });
});

describe('forms and keyboard navigation', () => {
  it.each([
    ['plain digits', '12345678'],
    ['formatted code', '1234-5678'],
    ['a leading space', ' 1234-5678'],
    ['surrounding whitespace', ' \t1234 5678 \n'],
    ['invisible characters', '\u200e1234-\u200b5678'],
    ['digit groups', '12 34 56 78'],
  ])('pastes all 8 digits from %s and submits the complete code', async (_label, pasted) => {
    let submitted: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        if (String(url).endsWith('/auth/email')) return new Response(null);
        if (String(url).endsWith('/auth/login')) {
          submitted = JSON.parse(String(options?.body));
          return new Response(JSON.stringify(auth));
        }
        if (String(url).endsWith('/activity/list'))
          return new Response(JSON.stringify({ data: [], nextId: null }));
        throw new Error('Unexpected endpoint');
      }),
    );
    const user = userEvent.setup();
    history.replaceState(null, '', '/activity');
    render(<App />);
    await user.type(screen.getByLabelText('Email address'), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    const code = await screen.findByRole('textbox', { name: 'Email code' });
    await user.click(code);
    await user.paste(pasted);
    expect((code as HTMLInputElement).value).toBe('1234-5678');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Notifications' });
    expect(submitted).toEqual({ email: 'test@example.test', code: 12345678 });
  });

  it('keeps invalid email and incomplete code out of the API', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith('/auth/email')) return new Response(null);
      throw new Error('Unexpected request');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    history.replaceState(null, '', '/activity');
    render(<App />);
    const email = screen.getByLabelText('Email address');
    await user.type(email, 'wrong-email');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await screen.findByText('Enter a valid email address.');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(email.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Enter a valid email address.',
    );
    expect(fetcher).not.toHaveBeenCalled();
    await user.clear(email);
    await user.type(email, 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    const code = await screen.findByLabelText('Email code');
    await user.type(code, '1234');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Enter all 8 digits from the email.');
    expect(code.getAttribute('aria-invalid')).toBe('true');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps the submitted email stable while sending and allows editing after a failed request', async () => {
    let finish: ((response: Response) => void) | undefined;
    let submitted: unknown;
    const fetcher = vi.fn<typeof fetch>(async (_url, options) => {
      submitted = JSON.parse(String(options?.body));
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    history.replaceState(null, '', '/login');
    render(<App />);
    const email = screen.getByLabelText('Email address') as HTMLInputElement;
    await user.type(email, 'first@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    await waitFor(() => expect(finish).toBeDefined());
    expect(screen.getByRole('button', { name: 'Sending code…' }).hasAttribute('disabled')).toBe(
      true,
    );
    await user.type(email, 'changed');
    expect(email.value).toBe('first@example.test');
    expect(submitted).toEqual({ email: 'first@example.test' });
    await act(async () => finish!(new Response(null, { status: 500 })));
    await screen.findByRole('alert');
    expect(email.readOnly).toBe(false);
    await user.clear(email);
    await user.type(email, 'second@example.test');
    await user.click(screen.getByRole('button', { name: 'Get a code' }));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(submitted).toEqual({ email: 'second@example.test' });
    await act(async () => finish!(new Response(null)));
    await screen.findByRole('heading', { name: 'Check your email' });
    expect(screen.getByText('second@example.test')).toBeTruthy();
    expect((screen.getByLabelText('Email code') as HTMLInputElement).readOnly).toBe(false);
  });

  it('changes the unread filter with arrow keys and presents an empty state', async () => {
    const user = userEvent.setup();
    renderFixtureApp(<App />);
    await screen.findAllByText('Marina');
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(document.title).toBe('Friendly'));
    const all = screen.getByRole('tab', { name: 'All' });
    all.focus();
    await user.keyboard('{ArrowRight}');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Unread' }).getAttribute('aria-selected')).toBe(
        'true',
      ),
    );
    await screen.findByRole('heading', { name: 'You are all caught up' });
    const panel = screen.getByRole('tabpanel');
    expect(document.getElementById(panel.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Unread',
    );
  });

  it('closes account menu with Escape and returns keyboard focus', async () => {
    const user = userEvent.setup();
    renderFixtureApp(<App />);
    await screen.findAllByText('Marina');
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitem', { name: 'Sign out' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
  });
});
