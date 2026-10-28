// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp as render, apiPath } from './render-app.test-utils';
import { App } from './App';

const post = (id: number, text: string) => ({
  id,
  accessHash: `hash-${id}`,
  text,
  owner: { id: 2, nickname: 'Author', description: '', interests: [] },
  instant: '2026-10-01T12:00:00Z',
});
const json = (data: unknown) => new Response(JSON.stringify(data));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function openFeed(list: (path: string) => Response | Promise<Response>) {
  localStorage.setItem('friendly.session.v2', JSON.stringify({ id: 1, accessHash: 'test-hash' }));
  history.replaceState(null, '', '/community');
  const fetcher = vi.fn<typeof fetch>(async (url) => {
    const path = apiPath(url);
    if (path === '/activity/list') return json({ data: [], nextId: null });
    if (path.startsWith('/community/list')) return list(path);
    if (path === '/community') return json({ id: 20, accessHash: 'hash-20' });
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  render(<App />);
  return fetcher;
}

describe('feed loading', () => {
  it('shows full post placeholders for a slow first request, then preserves mounted posts during refresh', async () => {
    const user = userEvent.setup();
    const initial = deferred<Response>();
    const refresh = deferred<Response>();
    let requests = 0;
    let refreshing = false;
    openFeed(() => {
      requests++;
      return refreshing ? refresh.promise : initial.promise;
    });
    const loading = await screen.findByRole('status', { name: 'Loading posts' });
    expect(loading.querySelectorAll('.post-skeleton').length).toBe(4);
    expect(screen.queryByRole('heading', { name: 'It is quiet here' })).toBeNull();
    await act(async () =>
      initial.resolve(json({ data: [post(10, 'An existing post.')], nextId: null })),
    );
    const existing = await screen.findByText('An existing post.');
    const card = existing.closest('article');
    expect(screen.queryByRole('status', { name: 'Loading posts' })).toBeNull();
    const initialRequests = requests;
    refreshing = true;
    await user.type(screen.getByRole('textbox', { name: 'What is happening?' }), 'A new post.');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(requests).toBe(initialRequests + 1));
    expect(screen.getByText('An existing post.').closest('article')).toBe(card);
    expect(screen.queryByRole('status', { name: 'Loading posts' })).toBeNull();
    await act(async () =>
      refresh.resolve(
        json({ data: [post(20, 'A new post.'), post(10, 'An existing post.')], nextId: null }),
      ),
    );
    await screen.findByText('A new post.');
    expect(screen.getByText('An existing post.').closest('article')).toBe(card);
  });

  it('keeps loaded posts through a failed next page and retries that cursor without refetching the first page', async () => {
    const user = userEvent.setup();
    const next = deferred<Response>();
    let recovered = false;
    const paths: string[] = [];
    openFeed((path) => {
      paths.push(path);
      if (path === '/community/list')
        return json({ data: [post(10, 'First page stays visible.')], nextId: 'next' });
      return recovered ? json({ data: [post(11, 'Second page.')], nextId: null }) : next.promise;
    });
    const existing = await screen.findByText('First page stays visible.');
    const card = existing.closest('article');
    const initialRequests = paths.length;
    await user.click(screen.getByRole('button', { name: 'Show more' }));
    const loading = await screen.findByRole('status', { name: 'Loading more posts' });
    expect(loading.querySelectorAll('.post-skeleton').length).toBe(2);
    expect(screen.getByText('First page stays visible.').closest('article')).toBe(card);
    expect(
      (screen.getByRole('button', { name: 'Loading more…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => next.resolve(new Response(null, { status: 403 })));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByRole('status', { name: 'Loading more posts' })).toBeNull();
    expect(screen.getByText('First page stays visible.').closest('article')).toBe(card);
    expect(card!.compareDocumentPosition(retry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    recovered = true;
    await user.click(retry);
    await screen.findByText('Second page.');
    expect(paths.slice(initialRequests)).toEqual(['/community/list/next', '/community/list/next']);
    expect(screen.getByText('First page stays visible.').closest('article')).toBe(card);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('replaces a failed initial load with a retryable error and then a genuine empty state', async () => {
    const user = userEvent.setup();
    const request = deferred<Response>();
    let recovered = false;
    openFeed(() => (recovered ? json({ data: [], nextId: null }) : request.promise));
    await screen.findByRole('status', { name: 'Loading posts' });
    await act(async () => request.resolve(new Response(null, { status: 403 })));
    const retry = await screen.findByRole('button', { name: 'Retry' });
    expect(screen.queryByRole('status', { name: 'Loading posts' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'It is quiet here' })).toBeNull();
    recovered = true;
    await user.click(retry);
    await screen.findByRole('heading', { name: 'It is quiet here' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('status', { name: 'Loading posts' })).toBeNull();
  });
});
