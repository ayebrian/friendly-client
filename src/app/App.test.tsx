// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import { renderApp as render } from './render-app.test-utils';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { StrictMode } from 'react';

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
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const owner = { id: 2, nickname: 'Тестовый автор', description: '', interests: [] };
const event = {
  id: 1,
  type: 'reply',
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
      expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
      expect(screen.queryByRole('navigation')).toBeNull();
    },
  );

  it('polls activity on a different page without enabling push', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let events = [event];
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
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
  it('updates badge and announces new events while viewing another route', async () => {
    const user = userEvent.setup();
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await user.click(screen.getByRole('button', { name: 'Try the demo' }));
    await screen.findByRole('heading', { name: 'Notifications' });
    await waitFor(() => expect(document.title).toBe('(3) Friendly'));
    await user.click(screen.getByRole('link', { name: 'My profile' }));
    await screen.findByRole('heading', { name: 'Alex' });
    await user.click(screen.getByRole('button', { name: 'Add activity' }));
    await waitFor(() => expect(document.title).toBe('(4) Friendly'));
    await screen.findByText('New reply');
    await user.click(screen.getByRole('button', { name: 'View' }));
    await screen.findByText('New activity arrived while you were on another page.');
    await user.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(document.title).toBe('Friendly'));
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('menuitem', { name: 'Exit demo' }));
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(screen.queryByText('Marina')).toBeNull();
  });

  it('restores unread status and badge after a failed read', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).includes('/activity/read/')) return new Response(null, { status: 500 });
      if (String(url).endsWith('/activity/list'))
        return new Response(JSON.stringify({ data: [event], nextId: null }));
      throw new Error(`Unexpected request ${String(url)}`);
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
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
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 401 })),
    );
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: 'Sign in to Friendly' });
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
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
    expect(JSON.parse(sessionStorage.getItem('friendly.session.v1')!)).toEqual(auth);
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

  it('changes the unread filter with arrow keys and presents an empty state', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the demo' }));
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
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the demo' }));
    await screen.findAllByText('Marina');
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menuitem', { name: 'Exit demo' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByRole('heading', { name: 'Notifications' })).toBeTruthy();
  });
});
