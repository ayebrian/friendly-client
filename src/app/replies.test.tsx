// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp as render, apiPath } from './render-app.test-utils';
import { App } from './App';

const author = { id: 2, nickname: 'Same author', description: '', interests: [] };
const post = (id: number, text: string) => ({
  id,
  accessHash: `hash-${id}`,
  text,
  owner: author,
  instant: '2026-10-01T12:00:00Z',
});
const root = post(10, 'Which **meeting place** should we pick?');
const first = post(11, 'The park entrance.');
const second = post(12, 'The cafe instead?');
const last = post(13, 'Yes, the cafe!');

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function openThread({
  upstream = [] as object[],
  replies = [] as object[],
  nextId = null as string | null,
} = {}) {
  localStorage.setItem('friendly.session.v2', JSON.stringify({ id: 1, accessHash: 'test-hash' }));
  history.replaceState(null, '', '/post/10/hash-10');
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    const path = apiPath(url);
    let data: unknown;
    if (path === '/activity/list') data = { data: [], nextId: null };
    else if (path === '/community/2/10/hash-10')
      data = { post: root, upstream, replies: { data: replies, nextId } };
    else if (/^\/community\/2\/\d+\/hash-\d+$/.test(path))
      data = {
        post: [first, second, last].find((p) => `/community/2/${p.id}/${p.accessHash}` === path),
        upstream: [],
        replies: { data: [], nextId: null },
      };
    else if (path === '/community/10/hash-10/replies2/next')
      data = { data: [{ type: 'single', post: post(14, 'Another direct reply.') }], nextId: null };
    else if (path === '/community') data = { id: 20, accessHash: 'new-hash' };
    else throw new Error(`Unexpected endpoint: ${path}`);
    return new Response(JSON.stringify(data));
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  return fetcher;
}

describe('reply context', () => {
  it('quotes replies to comments and omits the root post quote, including later pages', async () => {
    const user = userEvent.setup();
    openThread({ replies: [{ type: 'thread', thread: [first, second, last] }], nextId: 'next' });
    await screen.findByText('Yes, the cafe!');
    const quote = (id: number) =>
      within(document.getElementById(`post-${id}`)!).getByRole('link', { name: /Replying to/ });
    expect(document.getElementById('post-11')!.querySelector('.reply-context')).toBeNull();
    expect(quote(12).textContent).toContain('The park entrance.');
    expect(quote(13).textContent).toContain('The cafe instead?');
    expect(quote(13).getAttribute('href')).toBe('/post/12/hash-12');
    await user.click(screen.getByRole('button', { name: 'More replies' }));
    await screen.findByText('Another direct reply.');
    expect(document.getElementById('post-14')!.querySelector('.reply-context')).toBeNull();
  });

  it('opens collapsed ancestors locally, preserves a draft and sends it to the selected message', async () => {
    const user = userEvent.setup();
    const ancestor = post(9, 'An earlier question.');
    const fetcher = openThread({
      upstream: [post(8, 'The original post.'), ancestor],
      replies: [{ type: 'single', post: first }],
    });
    await screen.findByText('The park entrance.');
    // The first ancestor is the root, so its direct comment has no quote.
    expect(document.getElementById('post-9')!.querySelector('.reply-context')).toBeNull();
    // When viewing a comment's thread, its child still quotes that comment.
    expect(
      within(document.getElementById('post-11')!).getByRole('link', { name: /Replying to/ })
        .textContent,
    ).toContain('Which meeting place should we pick?');
    const ancestorCard = document.getElementById('post-9')!;
    const scroll = vi.fn();
    ancestorCard.scrollIntoView = scroll;
    const details = ancestorCard.closest('details')!;
    details.open = false;
    const originalQuote = within(document.getElementById('post-10')!).getByRole('link', {
      name: /Replying to/,
    });
    // Modified clicks retain the link destination for opening another tab.
    // Suppress only jsdom's unsupported native navigation, after React handles the event.
    let intercepted = true;
    document.addEventListener(
      'click',
      (event) => {
        intercepted = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );
    fireEvent.click(originalQuote, { ctrlKey: true });
    expect(intercepted).toBe(false);
    expect(scroll).not.toHaveBeenCalled();
    await user.click(originalQuote);
    expect(details.open).toBe(true);
    expect(scroll).toHaveBeenCalledWith({ block: 'start' });
    expect(document.activeElement).toBe(ancestorCard);
    expect(location.pathname).toBe('/post/10/hash-10');

    await user.click(
      within(document.getElementById('post-11')!).getByRole('button', { name: 'Reply' }),
    );
    const editor = await screen.findByRole('textbox', { name: 'Reply to Same author' });
    const composer = document.getElementById('thread-editor')!;
    expect(within(composer).getByRole('link', { name: /Replying to/ }).textContent).toContain(
      'The park entrance.',
    );
    await user.type(editor, 'Meet at six.');
    document.getElementById('post-11')!.scrollIntoView = vi.fn();
    await user.click(within(composer).getByRole('link', { name: /Replying to/ }));
    expect(editor.textContent).toBe('Meet at six.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([url, options]) => apiPath(url) === '/community' && options?.method === 'POST',
        ),
      ).toBe(true),
    );
    const options = fetcher.mock.calls.find(
      ([url, options]) => apiPath(url) === '/community' && options?.method === 'POST',
    )![1]!;
    expect(JSON.parse(String(options.body))).toMatchObject({
      text: 'Meet at six.',
      replyTo: { id: 11, accessHash: 'hash-11' },
    });
  });

  it('asks before leaving a thread with an unsent reply draft', async () => {
    const user = userEvent.setup();
    openThread({ replies: [{ type: 'single', post: first }] });
    await screen.findByText('The park entrance.');
    await user.click(
      within(document.getElementById('post-10')!).getByRole('button', { name: 'Reply' }),
    );
    await user.type(
      await screen.findByRole('textbox', { name: 'Reply to Same author' }),
      'Half-written thought',
    );
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const open = document.getElementById('post-11')!.querySelector('.post-open')!;
    fireEvent.click(open);
    expect(confirm).toHaveBeenCalledWith('Open another thread and discard your draft?');
    expect(location.pathname).toBe('/post/10/hash-10');
    expect(screen.getByRole('textbox', { name: 'Reply to Same author' }).textContent).toBe(
      'Half-written thought',
    );
    confirm.mockReturnValue(true);
    fireEvent.click(open);
    // The composer's own navigation guard confirms the discard, then the route changes.
    await user.click(await screen.findByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(location.pathname).toBe('/post/11/hash-11'));
    expect(screen.queryByRole('textbox', { name: 'Reply to Same author' })).toBeNull();
    confirm.mockRestore();
  });

  it('renders deleted and media-only parents without downloading media or nesting interactive content', async () => {
    const media = post(
      11,
      '![Beach](https://example.com/photo.png)\n<video src="https://example.com/video.mp4" controls></video>\n<audio src="https://example.com/audio.mp3" controls></audio>\n[Details](https://example.com)',
    );
    const deleted = { type: 'deleted', id: 12, accessHash: 'hash-12', instant: root.instant };
    openThread({ replies: [{ type: 'thread', thread: [media, deleted, last] }] });
    await screen.findByText('Yes, the cafe!');
    const mediaQuote = within(document.getElementById('post-12')!).getByRole('link', {
      name: /Replying to/,
    });
    expect(mediaQuote.textContent).toContain('[Image: Beach]');
    expect(mediaQuote.textContent).toContain('[Video]');
    expect(mediaQuote.textContent).toContain('[Audio]');
    expect(mediaQuote.querySelector('a, button, img, audio, video')).toBeNull();
    const deletedQuote = within(document.getElementById('post-13')!).getByRole('link', {
      name: /Replying to a deleted post/,
    });
    expect(deletedQuote.textContent).toContain('Original message deleted');
    expect(deletedQuote.getAttribute('href')).toBe('/post/12/hash-12');
  });
});
