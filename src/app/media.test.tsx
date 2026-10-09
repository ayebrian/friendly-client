// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render as renderMarkup,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp as render } from './render-app.test-utils';
import { App } from './App';
import { Markdown } from '../shared/markdown';
import { RuntimeContext } from '../shared/runtime';
import { createFixtureGateway } from './fixture-gateway.test-utils';

const NativeURL = URL;
const auth = { id: 1, token: 'test-token', accessHash: 'test-hash' };
const image = () => new File(['image'], 'photo.png', { type: 'image/png' });
const video = () => new File(['video'], 'clip.mp4', { type: 'video/mp4' });
const audio = () => new File(['audio'], 'voice.wav', { type: 'audio/wav' });
const json = (data: unknown) => new Response(JSON.stringify(data));

beforeEach(() => {
  let nextId = 0;
  vi.stubGlobal(
    'URL',
    class extends NativeURL {
      static createObjectURL = vi.fn(() => `blob:${location.origin}/media-${++nextId}`);
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  vi.unstubAllGlobals();
});

function live({
  upload,
  publish,
}: {
  upload?: (file: File, options: RequestInit, index: number) => Response | Promise<Response>;
  publish?: (text: string, index: number) => Response | Promise<Response>;
} = {}) {
  sessionStorage.setItem('friendly.session.v1', JSON.stringify(auth));
  history.replaceState(null, '', '/community');
  let uploadCount = 0;
  let publishCount = 0;
  let text = '';
  const fetcher = vi.fn<typeof fetch>(async (url, options = {}) => {
    const path = new URL(String(url)).pathname;
    if (path === '/activity/list') return json({ data: [], nextId: null });
    if (path === '/feed/queue') return json({ entries: [] });
    if (path === '/community/list')
      return json({
        data: text
          ? [
              {
                id: 10,
                accessHash: 'hash',
                text,
                owner: { id: 1, nickname: 'Author', interests: [] },
                instant: '2026-10-01T12:00:00Z',
              },
            ]
          : [],
        nextId: null,
      });
    if (path === '/files/upload') {
      const file = (options.body as FormData).get('file') as File;
      uploadCount++;
      return (
        upload?.(file, options, uploadCount) ??
        json({ id: uploadCount, accessHash: `file-${uploadCount}` })
      );
    }
    if (path === '/community' && options.method === 'POST') {
      text = JSON.parse(String(options.body)).text;
      publishCount++;
      return publish?.(text, publishCount) ?? json({ id: 10, accessHash: 'hash' });
    }
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const uploads = (fetcher: ReturnType<typeof live>) =>
  fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/files/upload');
const publications = (fetcher: ReturnType<typeof live>) =>
  fetcher.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/community');

function transfer(files: File[], items = true) {
  return {
    files: items ? [] : files,
    items: items ? files.map((file) => ({ kind: 'file', getAsFile: () => file })) : [],
    getData: () => '',
  } as unknown as DataTransfer;
}
function beforeInput(element: HTMLElement, dataTransfer: DataTransfer) {
  const event = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertFromPaste',
  });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  fireEvent(element, event);
  return event;
}

describe('media composing and publishing', () => {
  it('publishes an image, video and audio without a caption, and reuses uploads after a failed publication', async () => {
    const fetcher = live({
      publish: (_text, index) =>
        index === 1 ? new Response(null, { status: 500 }) : json({ id: 10, accessHash: 'hash' }),
    });
    const user = userEvent.setup();
    render(<App />);
    await user.upload(await screen.findByLabelText('Choose media files'), [
      image(),
      video(),
      audio(),
    ]);
    expect(screen.getByRole('list', { name: 'Attached media' }).children.length).toBe(3);
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect(uploads(fetcher)).toHaveLength(3);
    expect(screen.getAllByText(/MB · Uploaded/)).toHaveLength(3);
    for (const [, options] of uploads(fetcher)) {
      const file = (options!.body as FormData).get('file') as File;
      expect((options!.headers as Headers).get('X-File-Size')).toBe(String(file.size));
      expect((options!.headers as Headers).has('Content-Type')).toBe(false);
    }
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Attached media' })).toBeNull());
    expect(uploads(fetcher)).toHaveLength(3);
    const text = JSON.parse(String(publications(fetcher)[1][1]?.body)).text as string;
    expect(text).toContain('![photo.png](https://api.getfriend.ly/files/download/1/file-1)');
    expect(text).toContain(
      '<video src="https://api.getfriend.ly/files/download/2/file-2" controls playsinline></video>',
    );
    expect(text).toContain(
      '<audio src="https://api.getfriend.ly/files/download/3/file-3" controls></audio>',
    );
    expect(document.querySelector('.post-list video')).toBeTruthy();
    expect(document.querySelector('.post-list audio')).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
  });

  it('retains the caption and files after a partial upload failure, retrying only the failed upload', async () => {
    const fetcher = live({
      upload: (_file, _options, index) =>
        index === 2
          ? new Response(null, { status: 500 })
          : json({ id: index, accessHash: `file-${index}` }),
    });
    const user = userEvent.setup();
    render(<App />);
    const editor = await screen.findByLabelText('What is happening?');
    await user.type(editor, 'Keep my caption');
    await user.upload(screen.getByLabelText('Choose media files'), [image(), video()]);
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('Friendly is temporarily unavailable. Please try again later.');
    expect(editor.textContent).toBe('Keep my caption');
    expect(publications(fetcher)).toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Attached media' }).children.length).toBe(2);
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(publications(fetcher)).toHaveLength(1));
    expect(
      uploads(fetcher).map(([, options]) => ((options!.body as FormData).get('file') as File).name),
    ).toEqual(['photo.png', 'clip.mp4', 'clip.mp4']);
    const text = JSON.parse(String(publications(fetcher)[0][1]?.body)).text as string;
    expect(text.startsWith('Keep my caption\n\n![photo.png]')).toBe(true);
    expect(text).toContain('/1/file-1');
    expect(text).toContain('/3/file-3');
  });

  it('accepts clipboard items and files plus Android beforeinput without keyboard events or duplicate attachments', async () => {
    live();
    const user = userEvent.setup();
    render(<App />);
    const editor = await screen.findByLabelText('What is happening?');
    expect(editor.getAttribute('contenteditable')).toBe('true');
    const data = transfer([image()]);
    fireEvent.paste(editor, { clipboardData: data });
    expect(beforeInput(editor, data).defaultPrevented).toBe(true);
    expect(screen.getByRole('list', { name: 'Attached media' }).children.length).toBe(1);
    expect(beforeInput(editor, transfer([video()], false)).defaultPrevented).toBe(true);
    fireEvent.paste(editor, { clipboardData: transfer([audio()], false) });
    expect(screen.getByRole('list', { name: 'Attached media' }).children.length).toBe(3);
    await user.click(editor);
    await user.paste('Plain text still pastes');
    expect(editor.textContent).toBe('Plain text still pastes');
    expect(editor.querySelector('img')).toBeNull();
  });

  it('reads media with the explicit clipboard button and recovers from denied clipboard access', async () => {
    live();
    const user = userEvent.setup();
    const read = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError'))
      .mockResolvedValueOnce([
        {
          types: ['image/png', 'text/plain'],
          getType: async () => new Blob(['image'], { type: 'image/png' }),
        },
      ]);
    Object.defineProperty(navigator.clipboard, 'read', { configurable: true, value: read });
    render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Paste media' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Could not read media from the clipboard.',
    );
    await user.click(screen.getByRole('button', { name: 'Paste media' }));
    await screen.findByRole('list', { name: 'Attached media' });
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects unsupported and oversized files while allowing recovery with a valid file', async () => {
    const fetcher = live();
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);
    const picker = await screen.findByLabelText('Choose media files');
    await user.upload(picker, [
      new File(['x'], 'script.svg', { type: 'image/svg+xml' }),
      new File([new Uint8Array(5_000_001)], 'large.mp4', { type: 'video/mp4' }),
    ]);
    expect((await screen.findByRole('alert')).textContent).toContain('script.svg: choose a photo');
    expect(screen.queryByRole('list', { name: 'Attached media' })).toBeNull();
    expect(uploads(fetcher)).toHaveLength(0);
    await user.upload(picker, image());
    expect(screen.queryByRole('alert')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await waitFor(() => expect(publications(fetcher)).toHaveLength(1));
  });

  it('protects a file-only draft and releases preview URLs when removing attachments', async () => {
    live();
    const user = userEvent.setup();
    render(<App />);
    await user.upload(await screen.findByLabelText('Choose media files'), image());
    const preview = screen.getByRole('img', { name: 'photo.png' }).getAttribute('src');
    await user.click(screen.getByRole('link', { name: 'People' }));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await user.click(screen.getByRole('button', { name: 'Remove photo.png' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(preview);
    await user.click(screen.getByRole('link', { name: 'People' }));
    await screen.findByRole('heading', { name: 'Find your people' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it.each(['navigation', 'sign out'])(
    'aborts uploads on %s and never publishes a late upload response',
    async (action) => {
      let finish: ((response: Response) => void) | undefined;
      let signal: AbortSignal | undefined;
      const fetcher = live({
        upload: (_file, options) => {
          signal = options.signal!;
          return new Promise((resolve) => {
            finish = resolve;
          });
        },
      });
      const user = userEvent.setup();
      render(<App />);
      await user.upload(await screen.findByLabelText('Choose media files'), [image(), video()]);
      await user.click(screen.getByRole('button', { name: 'Post' }));
      await waitFor(() => expect(signal).toBeDefined());
      expect(screen.getByRole('button', { name: 'Uploading…' }).hasAttribute('disabled')).toBe(
        true,
      );
      if (action === 'navigation') {
        await user.click(screen.getByRole('link', { name: 'People' }));
        await screen.findByRole('heading', { name: 'Find your people' });
      } else {
        await user.click(screen.getByRole('button', { name: 'Account menu' }));
        await user.click(screen.getByRole('menuitem', { name: 'Sign out' }));
        await screen.findByRole('heading', { name: 'Sign in to Friendly' });
      }
      expect(signal!.aborted).toBe(true);
      await act(async () => finish!(json({ id: 7, accessHash: 'late-file' })));
      expect(uploads(fetcher)).toHaveLength(1);
      expect(publications(fetcher)).toHaveLength(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    },
  );

  it('clears the account when an upload reports an expired session', async () => {
    const fetcher = live({ upload: () => new Response(null, { status: 401 }) });
    const user = userEvent.setup();
    render(<App />);
    await user.upload(await screen.findByLabelText('Choose media files'), image());
    await user.click(screen.getByRole('button', { name: 'Post' }));
    await screen.findByText('Your session has ended. Please sign in again.');
    expect(sessionStorage.getItem('friendly.session.v1')).toBeNull();
    expect(publications(fetcher)).toHaveLength(0);
  });

  it('renders media controls after approval while removing executable HTML and unsafe sources', async () => {
    const user = userEvent.setup();
    renderMarkup(
      <Markdown
        text={
          '<video src="https://example.test/clip.mp4" controls autoplay onerror="alert(1)"></video>\n\n<audio src="https://example.test/voice.wav" controls></audio>\n\n<script>alert(1)</script><img src="javascript:alert(1)" onerror="alert(1)">'
        }
      />,
    );
    expect(document.querySelector('video, audio')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load video' }));
    await user.click(screen.getByRole('button', { name: 'Load audio' }));
    const player = document.querySelector('video')!;
    expect(player.controls).toBe(true);
    expect(player.playsInline).toBe(true);
    expect(player.hasAttribute('autoplay')).toBe(false);
    expect(player.hasAttribute('onerror')).toBe(false);
    expect(document.querySelector('audio')!.controls).toBe(true);
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('[src^="javascript:"]')).toBeNull();
  });

  it('keeps approval through refresh, requires approval for a changed URL and allows retry after a media error', async () => {
    const user = userEvent.setup();
    const text = '![Remote photo](https://external.test/photo.png)';
    const view = renderMarkup(<Markdown text={text} />);
    expect(document.querySelector('img')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Load image' }));
    expect(screen.getByRole('img').getAttribute('referrerpolicy')).toBe('no-referrer');
    view.rerender(<Markdown text={text} />);
    expect(screen.queryByRole('button', { name: 'Load image' })).toBeNull();
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Could not load image')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry image' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe('https://external.test/photo.png');
    view.rerender(<Markdown text="![Remote photo](https://external.test/another.png)" />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load image' })).toBeTruthy();
  });

  it("does not let source, srcset, unsafe protocols or another origin's blob bypass approval", () => {
    renderMarkup(
      <Markdown
        text={`<picture><source srcset="https://external.test/track.png"><img src="https://external.test/photo.png" srcset="https://external.test/track.png"></picture>

<video><source src="https://external.test/track.mp4"></video>

<img src="data:image/svg+xml,unsafe"><img src="blob:https://external.test/uuid"><img src="https://user:password@external.test/photo.png">`}
      />,
    );
    expect(document.querySelector('source, img, audio, video, [srcset]')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Load image' })).toHaveLength(1);
  });

  it('trusts only the exact configured API download path, same origin and local blobs', () => {
    renderMarkup(
      <RuntimeContext
        value={{
          gateway: createFixtureGateway().gateway,
          mediaBaseUrl: 'https://gateway.test/v1',
          userId: 1,
          enablePush: async () => {},
          disablePush: async () => {},
          logout: () => {},
        }}
      >
        <Markdown
          text={`![Local](/local.png)

![Preview](blob:${location.origin}/preview)

![Download](https://gateway.test/v1/files/download/1/hash)

![Other API path](https://gateway.test/v1/files/downloadish/1/hash)

![Other host](https://gateway.test.attacker.test/v1/files/download/1/hash)

![Traversed path](https://gateway.test/v1/files/download/../../../tracking.png)`}
        />
      </RuntimeContext>,
    );
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('alt'))).toEqual([
      'Local',
      'Preview',
      'Download',
    ]);
    expect(screen.getAllByRole('button', { name: 'Load image' })).toHaveLength(3);
  });

  it('loads external HTTPS images through the proxy automatically, keeps Friendly files local and never falls back after errors', async () => {
    const user = userEvent.setup();
    renderMarkup(
      <RuntimeContext
        value={{
          gateway: createFixtureGateway().gateway,
          mediaBaseUrl: 'https://gateway.test/v1',
          imageProxyUrl: 'https://proxy.example.com/image',
          userId: 1,
          enablePush: async () => {},
          disablePush: async () => {},
          logout: () => {},
        }}
      >
        <Markdown
          text={`![Remote](https://images.example.com/photo.png?version=1)

![Friendly](https://gateway.test/v1/files/download/1/hash)

![Preview](blob:${location.origin}/preview)

<video src="https://images.example.com/clip.mp4"></video>

<audio src="https://images.example.com/voice.wav"></audio>`}
        />
      </RuntimeContext>,
    );
    const expected = new URL('https://proxy.example.com/image');
    expected.searchParams.set('url', 'https://images.example.com/photo.png?version=1');
    const remote = screen.getByRole('img', { name: 'Remote' });
    expect(remote.getAttribute('src')).toBe(expected.href);
    expect(remote.getAttribute('crossorigin')).toBe('anonymous');
    expect(screen.queryByRole('button', { name: 'Load image' })).toBeNull();
    expect(screen.getByRole('img', { name: 'Friendly' }).getAttribute('src')).toBe(
      'https://gateway.test/v1/files/download/1/hash',
    );
    expect(screen.getByRole('img', { name: 'Preview' }).getAttribute('src')).toBe(
      `blob:${location.origin}/preview`,
    );
    expect(document.querySelector('audio, video')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load audio' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open image: Remote' }));
    expect(
      screen
        .getAllByRole('img', { name: 'Remote', hidden: true })
        .map((image) => image.getAttribute('src')),
    ).toEqual([expected.href, expected.href]);
    await user.keyboard('{Escape}');
    fireEvent.error(remote);
    expect(screen.queryByRole('img', { name: 'Remote' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry image' }));
    expect(screen.getByRole('img', { name: 'Remote' }).getAttribute('src')).toBe(expected.href);
  });
});
