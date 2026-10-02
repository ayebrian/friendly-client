import { exports as worker } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadImage, MAX_IMAGE_BYTES } from '../src/source';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...new Array<number>(64).fill(0)]);
const appOrigin = 'https://friendly.hausmer.com';
const source = 'https://images.example.com/photo.png';
type Remote = (url: URL, init?: RequestInit) => Response | Promise<Response>;

function upstream(
  remote: Remote = () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
  addresses = ['93.184.215.14'],
) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockClear()
    .mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === 'cloudflare-dns.com')
        return Response.json({
          Status: 0,
          Answer: addresses.map((data) => ({ type: data.includes(':') ? 28 : 1, data })),
        });
      return remote(url, init);
    });
}

function request(url = source, origin: string | null = appOrigin, method = 'GET') {
  const endpoint = new URL('https://proxy.example.com/image');
  endpoint.searchParams.set('url', url);
  return worker.default.fetch(endpoint, { method, headers: origin ? { Origin: origin } : {} });
}

beforeEach(() => {
  vi.restoreAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('image Worker', () => {
  it('streams an image through both entrypoints without forwarding client headers', async () => {
    const calls = upstream();
    const endpoint = new URL('https://proxy.example.com/image');
    endpoint.searchParams.set('url', source);
    const response = await worker.default.fetch(endpoint, {
      headers: {
        Origin: appOrigin,
        Cookie: 'test-cookie',
        Authorization: 'test-only',
        'X-Token': 'test-token',
        'X-User-Id': '1',
        'CF-Connecting-IP': '203.0.113.99',
        'X-Real-IP': '203.0.113.99',
        'X-Forwarded-For': '203.0.113.99',
        'True-Client-IP': '203.0.113.99',
        Forwarded: 'for=203.0.113.99',
        'User-Agent': 'Visitor-specific test agent',
        Referer: appOrigin + '/community',
      },
    });
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(appOrigin);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600, must-revalidate');
    const outbound = calls.mock.calls.find(([url]) => String(url) === source)!;
    const headers = new Headers(outbound[1]?.headers);
    for (const name of [
      'Cookie',
      'Authorization',
      'X-Token',
      'X-User-Id',
      'Referer',
      'Origin',
      'CF-Connecting-IP',
      'X-Real-IP',
      'X-Forwarded-For',
      'True-Client-IP',
      'Forwarded',
    ])
      expect(headers.has(name)).toBe(false);
    expect(headers.get('User-Agent')).toBe('Friendly-Image-Proxy/1.0');
    expect(outbound[1]?.redirect).toBe('manual');
  });

  it.each([null, 'https://attacker.example.com', appOrigin + '.attacker.example.com'])(
    'rejects disallowed origin %s before any network access',
    async (origin) => {
      const calls = upstream();
      const response = await request(source, origin);
      expect(response.status).toBe(403);
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it('rejects unsupported methods and allows CORS preflight without fetching', async () => {
    const calls = upstream();
    expect((await request(source, appOrigin, 'POST')).status).toBe(405);
    const response = await request(source, appOrigin, 'OPTIONS');
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET');
    expect(calls).not.toHaveBeenCalled();
  });

  it.each([
    'http://images.example.com/x',
    'https://user:secret@images.example.com/x',
    'https://127.0.0.1/x',
    'https://2130706433/x',
    'https://[::1]/x',
    'https://host.local/x',
    'https://images.example.com:8443/x',
    'https://proxy.example.com/image',
  ])('blocks unsafe target %s', async (url) => {
    const calls = upstream();
    const response = await request(url);
    expect([400, 403]).toContain(response.status);
    expect(calls).not.toHaveBeenCalled();
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.0.2.1',
    '::1',
    'fc00::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])('rejects private/reserved DNS answer %s', async (address) => {
    const calls = upstream(undefined, ['93.184.215.14', address]);
    const response = await loadImage(source, 'proxy.example.com');
    expect(response.status).toBe(403);
    expect(
      calls.mock.calls.every(([input]) => new URL(String(input)).hostname === 'cloudflare-dns.com'),
    ).toBe(true);
  });

  it('follows a public redirect but validates its target before making another request', async () => {
    const visited: string[] = [];
    upstream((url) => {
      visited.push(url.hostname);
      return url.hostname === 'images.example.com'
        ? new Response(null, {
            status: 302,
            headers: { Location: 'https://cdn.example.com/photo.png' },
          })
        : new Response(png, { headers: { 'Content-Type': 'image/png' } });
    });
    const response = await loadImage(source, 'proxy.example.com');
    expect(response.status).toBe(200);
    await response.arrayBuffer();
    expect(visited).toEqual(['images.example.com', 'cdn.example.com']);
    const calls = upstream(
      () => new Response(null, { status: 302, headers: { Location: 'https://127.0.0.1/private' } }),
    );
    expect((await loadImage(source, 'proxy.example.com')).status).toBe(403);
    expect(
      calls.mock.calls.filter(
        ([input]) => new URL(String(input)).hostname !== 'cloudflare-dns.com',
      ),
    ).toHaveLength(1);
  });

  it('stops a redirect loop and never redirects the browser to the source', async () => {
    upstream(() => new Response(null, { status: 302, headers: { Location: source } }));
    const response = await loadImage(source, 'proxy.example.com');
    expect(response.status).toBe(502);
    expect(response.headers.has('Location')).toBe(false);
  });

  it.each([
    ['image/svg+xml', '<svg><script>unsafe</script></svg>'],
    ['text/html', '<html>unsafe</html>'],
    ['image/png', '<html>spoofed content type</html>'],
    ['application/octet-stream', '<html>generic executable content</html>'],
    ['binary/octet-stream', '<svg><script>unsafe</script></svg>'],
    ['application/octet-stream', 'arbitrary binary download'],
  ])('rejects executable or spoofed media %s', async (type, body) => {
    upstream(() => new Response(body, { headers: { 'Content-Type': type } }));
    expect((await loadImage(source, 'proxy.example.com')).status).toBe(415);
  });

  it.each([
    ['image/png', png],
    ['image/jpeg', new Uint8Array([255, 216, 255, ...new Array<number>(64).fill(0)])],
    ['image/gif', new TextEncoder().encode('GIF89a' + '0'.repeat(64))],
    ['image/webp', new TextEncoder().encode('RIFF0000WEBP' + '0'.repeat(64))],
    ['image/avif', new TextEncoder().encode('0000ftypavif' + '0'.repeat(64))],
  ])('identifies %s in a generic binary download', async (type, bytes) => {
    upstream(
      () => new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }),
    );
    const response = await request();
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe(type);
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it.each([null, 'binary/octet-stream', 'Application/Octet-Stream; charset=binary'])(
    'identifies a fragmented PNG with generic Content-Type %s',
    async (type) => {
      upstream(() => {
        let offset = 0;
        return new Response(
          new ReadableStream({
            pull(controller) {
              if (offset === png.length) return controller.close();
              controller.enqueue(png.subarray(offset, ++offset));
            },
          }),
          { headers: type ? { 'Content-Type': type } : {} },
        );
      });
      const response = await loadImage(source, 'proxy.example.com');
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    },
  );

  it('rejects a missing MIME without a raster signature and mismatched raster MIME', async () => {
    upstream(() => new Response(new TextEncoder().encode('<svg>unsafe</svg>')));
    expect((await loadImage(source, 'proxy.example.com')).status).toBe(415);
    upstream(() => new Response(png, { headers: { 'Content-Type': 'image/jpeg' } }));
    expect((await loadImage(source, 'proxy.example.com')).status).toBe(415);
  });

  it('rejects an oversized declared response before reading its body', async () => {
    upstream(
      () =>
        new Response(png, {
          headers: { 'Content-Type': 'image/png', 'Content-Length': String(MAX_IMAGE_BYTES + 1) },
        }),
    );
    expect((await loadImage(source, 'proxy.example.com')).status).toBe(413);
  });

  it('enforces the byte limit on a stream without Content-Length and cancels upstream', async () => {
    const cancel = vi.fn();
    let part = 0;
    upstream(
      () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              controller.enqueue(part++ === 0 ? png : new Uint8Array(MAX_IMAGE_BYTES));
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'image/png' } },
        ),
    );
    const response = await loadImage(source, 'proxy.example.com');
    await expect(response.arrayBuffer()).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });

  it('cancels the source stream when the consumer stops reading', async () => {
    const cancel = vi.fn();
    upstream(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(png);
            },
            cancel,
          }),
          { headers: { 'Content-Type': 'image/png' } },
        ),
    );
    const response = await loadImage(source, 'proxy.example.com');
    await response.body!.cancel();
    expect(cancel).toHaveBeenCalled();
  });

  it('times out a stalled upstream request', async () => {
    vi.useFakeTimers();
    upstream(
      (_url, init) =>
        new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          ),
        ),
    );
    const pending = loadImage(source, 'proxy.example.com');
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).status).toBe(504);
  });

  it('never forwards Set-Cookie or caches a private image', async () => {
    upstream(
      () =>
        new Response(png, {
          headers: {
            'Content-Type': 'image/png',
            'Set-Cookie': 'test=only',
            'Cache-Control': 'private',
            Location: 'https://images.example.com/other',
          },
        }),
    );
    const response = await loadImage(source, 'proxy.example.com');
    await response.arrayBuffer();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(response.headers.has('Location')).toBe(false);
  });

  it('respects a shorter source cache lifetime', async () => {
    upstream(
      () =>
        new Response(png, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=300' },
        }),
    );
    const response = await loadImage(source, 'proxy.example.com');
    await response.arrayBuffer();
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300, must-revalidate');
  });

  it.each([
    ['max-age="0"', 'no-store'],
    ['max-age="10"', 'public, max-age=10, must-revalidate'],
    ['max-age=0, s-maxage=3600', 'no-store'],
    ['max-age=60, s-maxage=3600', 'public, max-age=60, must-revalidate'],
    ['max-age=3600, s-maxage=60', 'public, max-age=60, must-revalidate'],
    ['max-age=60, must-revalidate', 'public, max-age=60, must-revalidate'],
    ['max-age=60, stale-if-error=86400', 'public, max-age=60, must-revalidate'],
    ['MAX-AGE = "15", S-MAXAGE = "30"', 'public, max-age=15, must-revalidate'],
    ['private="Set-Cookie, X-Custom", max-age=60', 'no-store'],
    ['no-cache="ETag", max-age=60', 'no-store'],
    ['no-store, max-age=60', 'no-store'],
    ['max-age=-1', 'no-store'],
    ['max-age=12garbage', 'no-store'],
    ['max-age="12', 'no-store'],
    ['max-age', 'no-store'],
    ['max-age=10, max-age=20', 'no-store'],
    ['max-age=9007199254740992', 'no-store'],
    ['extension="x,max-age=3600", max-age=20', 'public, max-age=20, must-revalidate'],
  ])('keeps the source cache policy conservative: %s', async (policy, expected) => {
    upstream(
      () =>
        new Response(png, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': policy },
        }),
    );
    const response = await request();
    await response.arrayBuffer();
    // The public gateway must preserve the restrictive policy for the browser too.
    expect(response.headers.get('Cache-Control')).toBe(expected.replace('public,', 'private,'));
  });

  it.each([
    ['40', 'public, max-age=20, must-revalidate'],
    ['60', 'no-store'],
    ['90', 'no-store'],
    ['invalid', 'no-store'],
  ])('does not restart an upstream cached image lifetime (Age: %s)', async (age, expected) => {
    upstream(
      () =>
        new Response(png, {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=60', Age: age },
        }),
    );
    const response = await loadImage(source, 'proxy.example.com');
    await response.arrayBuffer();
    expect(response.headers.get('Cache-Control')).toBe(expected);
  });

  it('rate limits requests through the real binding even when the image can be cached', async () => {
    upstream();
    const endpoint = new URL('https://proxy.example.com/image');
    endpoint.searchParams.set('url', source + '?rate-limit-test');
    for (let index = 0; index < 300; index++) {
      const response = await worker.default.fetch(endpoint, {
        headers: { Origin: appOrigin, 'CF-Connecting-IP': '203.0.113.42' },
      });
      expect(response.status).toBe(200);
      await response.arrayBuffer();
    }
    const response = await worker.default.fetch(endpoint, {
      headers: { Origin: appOrigin, 'CF-Connecting-IP': '203.0.113.42' },
    });
    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not log a signed source URL even when an upstream exception includes it', async () => {
    const signed = source + '?signature=test-only-private-signature';
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    upstream(() => {
      throw new Error(`Download failed: ${signed}`);
    });
    const response = await loadImage(signed, 'proxy.example.com');
    expect(response.status).toBe(502);
    expect(log).toHaveBeenCalledWith(
      JSON.stringify({
        event: 'image_fetch_failed',
        stage: 'fetch',
        errorType: 'Error',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(signed);
    expect(await response.text()).not.toContain('signature');
  });
});
