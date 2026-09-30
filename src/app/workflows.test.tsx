// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

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

describe('feed, drafts and form recovery', () => {
  it('preserves an inline publication after a failed request and refreshes the feed on retry', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/community');
    let text = '';
    let fail = true;
    const fetcher = vi.fn<typeof fetch>(async (url, options) => {
      const path = new URL(String(url)).pathname;
      if (path === '/activity/list')
        return new Response(JSON.stringify({ data: [], nextId: null }));
      if (path === '/community/list')
        return new Response(
          JSON.stringify({
            data: text ? [{ ...event.post, text }] : [],
            nextId: null,
          }),
        );
      if (path === '/community' && options?.method === 'POST') {
        if (fail) {
          fail = false;
          return new Response(null, { status: 500 });
        }
        text = JSON.parse(String(options.body)).text;
        return new Response(JSON.stringify({ id: 10, accessHash: 'hash' }));
      }
      throw new Error('Unexpected endpoint');
    });
    vi.stubGlobal('fetch', fetcher);
    const user = userEvent.setup();
    render(<App />);
    const input = await screen.findByLabelText('What is happening?');
    await user.type(input, 'Сохраняем черновик при ошибке сети');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect((input as HTMLTextAreaElement).value).toBe('Сохраняем черновик при ошибке сети');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(document.querySelector('.post-list')?.textContent).toContain(text));
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''));
    expect(
      screen.queryByText('Friendly is temporarily unavailable. Please try again later.'),
    ).toBeNull();
    expect(location.pathname).toBe('/community');
  });

  it('cancels an inline publication when leaving the feed', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/community');
    let publicationSignal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list' || path === '/community/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        if (path === '/feed/queue') return new Response(JSON.stringify({ entries: [] }));
        if (path === '/community') {
          publicationSignal = options?.signal as AbortSignal;
          return new Promise<Response>((_resolve, reject) =>
            publicationSignal!.addEventListener('abort', () => reject(publicationSignal!.reason), {
              once: true,
            }),
          );
        }
        throw new Error('Unexpected endpoint');
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText('What is happening?'), 'Запрос в процессе');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(publicationSignal).toBeDefined());
    await user.click(screen.getByRole('link', { name: 'People' }));
    await screen.findByRole('heading', { name: 'Find your people' });
    expect(publicationSignal!.aborted).toBe(true);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the draft when switching reply targets is declined', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Try the demo' }));
      await user.click((await screen.findAllByRole('link', { name: 'Open reply' }))[0]);
      await screen.findByRole('heading', { name: 'Thread' });
      const replies = screen.getAllByRole('button', { name: 'Reply' });
      replies.at(-1)!.focus();
      await user.keyboard('{Enter}');
      const input = await screen.findByLabelText(/Reply to/);
      await waitFor(() => expect(document.activeElement).toBe(input));
      await user.type(input, 'Не потерять ответ');
      await user.click(replies.at(-1)!);
      expect(confirm).not.toHaveBeenCalled();
      expect((input as HTMLTextAreaElement).value).toBe('Не потерять ответ');
      await user.click(replies[0]);
      expect(confirm).toHaveBeenCalledOnce();
      expect((input as HTMLTextAreaElement).value).toBe('Не потерять ответ');
      confirm.mockReturnValue(true);
      await user.click(replies[0]);
      expect(((await screen.findByLabelText('Reply to Alex')) as HTMLTextAreaElement).value).toBe(
        '',
      );
    } finally {
      confirm.mockRestore();
    }
  });

  it('can clear an invalid avatar selection and still save the profile', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Try the demo' }));
    await user.click(screen.getByRole('link', { name: 'My profile' }));
    await user.click(await screen.findByRole('link', { name: 'Edit' }));
    await user.upload(
      await screen.findByLabelText('Photo'),
      new File(['invalid'], 'wrong.txt', { type: 'text/plain' }),
    );
    await screen.findByText('Choose a JPG, PNG, WebP, or GIF up to 5 MB.');
    expect(
      (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Clear file selection' }));
    expect(
      (screen.getByRole('button', { name: 'Save profile' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Updated name');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await screen.findByRole('heading', { name: 'Updated name' });
  });

  it('selects the invitation for manual copying when the clipboard rejects the request', async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Denied'));
    try {
      render(<App />);
      await user.click(screen.getByRole('button', { name: 'Try the demo' }));
      await user.click(screen.getByRole('button', { name: 'Account menu' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Invite a friend' }));
      await user.click(await screen.findByRole('button', { name: 'Create invitation' }));
      const input = (await screen.findByLabelText('Your link')) as HTMLInputElement;
      await user.click(screen.getByRole('button', { name: 'Copy link' }));
      await screen.findByText(
        'Automatic copying is unavailable. The link is selected so you can copy it manually.',
      );
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
      write.mockResolvedValue(undefined);
      await user.click(screen.getByRole('button', { name: 'Copy link' }));
      await screen.findByRole('button', { name: 'Copied' });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(write).toHaveBeenLastCalledWith(input.value);
    } finally {
      write.mockRestore();
    }
  });
});

describe('pending thread operations', () => {
  it('keeps reply targets disabled during submission and restores the draft after failure', async () => {
    sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
    history.replaceState(null, '', '/post/10/hash');
    let finish: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === '/activity/list')
          return new Response(JSON.stringify({ data: [], nextId: null }));
        if (path === '/community/2/10/hash')
          return new Response(
            JSON.stringify({
              post: event.post,
              replies: { data: [], nextId: null },
              upstream: [],
            }),
          );
        if (path === '/community')
          return new Promise<Response>((resolve) => {
            finish = resolve;
          });
        throw new Error('Unexpected endpoint');
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Reply' }));
    const input = (await screen.findByLabelText('Reply to Тестовый автор')) as HTMLTextAreaElement;
    await user.type(input, 'Ответ сохраняется при ошибке');
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(finish).toBeDefined());
    expect((screen.getByRole('button', { name: 'Reply' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(async () => finish!(new Response(null, { status: 500 })));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect(input.value).toBe('Ответ сохраняется при ошибке');
    expect((screen.getByRole('button', { name: 'Reply' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});
