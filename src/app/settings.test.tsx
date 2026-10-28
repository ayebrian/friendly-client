// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, apiPath } from './render-app.test-utils';
import { App } from './App';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

it.each(['1234-5678', '1234 5678'])(
  'confirms a pasted code %s and preserves it for retry after an error',
  async (clipboard) => {
    localStorage.setItem('friendly.session.v2', JSON.stringify({ id: 1, accessHash: 'test-hash' }));
    history.replaceState(null, '', '/settings');
    const confirmations: unknown[] = [];
    let email: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = apiPath(url);
        if (path === '/activity/list') return Response.json({ data: [], nextId: null });
        if (path === '/users/details2')
          return Response.json({
            user: { id: 1, accessHash: 'test-hash', nickname: 'Test user', interests: [], email },
          });
        if (path === '/email/link') return new Response(null, { status: 204 });
        if (path === '/email/confirm') {
          confirmations.push(JSON.parse(String(options?.body)));
          if (confirmations.length === 1) return new Response(null, { status: 500 });
          email = 'test@example.test';
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected endpoint: ${path}`);
      }),
    );
    const user = userEvent.setup();
    renderApp(<App />);
    await user.type(await screen.findByLabelText('Email address'), 'test@example.test');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    const input = await screen.findByLabelText('Verification code');
    await user.click(input);
    await user.paste('1234-567');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    await screen.findByText('Enter the 8-digit code from your email.');
    expect(confirmations).toHaveLength(0);
    await user.clear(input);
    await user.paste(clipboard);
    expect((input as HTMLInputElement).value).toBe('1234-5678');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect((input as HTMLInputElement).value).toBe('1234-5678');
    await user.click(screen.getByRole('button', { name: 'Verify email' }));
    await screen.findByRole('button', { name: 'Unlink email' });
    expect(confirmations).toEqual([{ code: 12345678 }, { code: 12345678 }]);
  },
);
