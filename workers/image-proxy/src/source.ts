import ipaddr from 'ipaddr.js';
import { imageCacheControl } from './cache-policy';

export const MAX_IMAGE_BYTES = 5_000_000;
const TIMEOUT_MS = 12_000;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);
const TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

export class ProxyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export function imageUrl(source: string, proxyHost: string) {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new ProxyError(400, 'invalid_url');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (source.length > 4096 || url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new ProxyError(400, 'invalid_url');
  if (
    host === proxyHost ||
    host.length > 253 ||
    !host.includes('.') ||
    ipaddr.isValid(host.replace(/^\[|\]$/g, '')) ||
    /(?:^|\.)(?:localhost|local|internal|lan|home|onion|test|invalid|example)$/.test(host) ||
    host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  )
    throw new ProxyError(403, 'blocked_host');
  url.hostname = host;
  url.hash = '';
  return url;
}

function publicAddress(value: string) {
  if (!ipaddr.isValid(value)) return false;
  const address = ipaddr.parse(value);
  if (address.range() !== 'unicast') return false;
  return !(address instanceof ipaddr.IPv6) || address.match(ipaddr.IPv6.parse('2000::'), 3);
}

// Reject hosts resolving to private/reserved IPs, including mixed A/AAAA answers.
// This is a preflight check, not DNS pinning. Deploy only with public Workers fetch,
// without VPC/private-network bindings; see README for the rebinding boundary.
async function checkDns(host: string, signal: AbortSignal) {
  const addresses = (
    await Promise.all(
      ['A', 'AAAA'].map(async (type) => {
        const endpoint = new URL('https://cloudflare-dns.com/dns-query');
        endpoint.searchParams.set('name', host);
        endpoint.searchParams.set('type', type);
        const response = await fetch(endpoint, {
          signal,
          redirect: 'manual',
          headers: { Accept: 'application/dns-json' },
        });
        if (!response.ok || !response.body) throw new ProxyError(502, 'dns_failed');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 65_536) throw new ProxyError(502, 'dns_failed');
            chunks.push(value);
          }
        } finally {
          await reader.cancel().catch(() => {});
        }
        const data: unknown = JSON.parse(await new Blob(chunks).text());
        if (!data || typeof data !== 'object' || !('Status' in data) || data.Status !== 0)
          throw new ProxyError(502, 'dns_failed');
        const answers = 'Answer' in data ? data.Answer : [];
        if (!Array.isArray(answers) || answers.length > 64) throw new ProxyError(502, 'dns_failed');
        return answers
          .filter((record) => record && [1, 28].includes(record.type))
          .map((record) => record.data as unknown);
      }),
    )
  ).flat();
  if (
    !addresses.length ||
    addresses.some((value) => typeof value !== 'string' || !publicAddress(value))
  )
    throw new ProxyError(403, 'blocked_address');
}

function validSignature(bytes: Uint8Array, type: string) {
  const ascii = new TextDecoder().decode(bytes);
  if (type === 'image/png')
    return [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value);
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/gif') return ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a');
  if (type === 'image/webp') return ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP';
  return (
    type === 'image/avif' && ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 32))
  );
}

export function failure(error: unknown) {
  const fault = error instanceof ProxyError ? error : new ProxyError(502, 'upstream_failed');
  return Response.json(
    { error: fault.code },
    {
      status: fault.status,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
      },
    },
  );
}

export async function loadImage(source: string, proxyHost: string) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let stage = 'url';
  try {
    let url = imageUrl(source, proxyHost);
    let response: Response;
    for (let hop = 0; ; hop++) {
      stage = 'dns';
      await checkDns(url.hostname, abort.signal);
      // Construct a fresh request: never forward account, cookie, IP or referrer headers.
      stage = 'fetch';
      response = await fetch(url, {
        signal: abort.signal,
        redirect: 'manual',
        headers: {
          Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
          'User-Agent': 'Friendly-Image-Proxy/1.0',
        },
      });
      if (!REDIRECTS.has(response.status)) break;
      const location = response.headers.get('Location');
      await response.body?.cancel();
      if (hop >= 3 || !location) throw new ProxyError(502, 'redirect_failed');
      url = imageUrl(new URL(location, url).href, proxyHost);
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel();
      throw new ProxyError(response.status === 404 ? 404 : 502, 'upstream_failed');
    }
    const type = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() ?? '';
    stage = 'image';
    if (!TYPES.has(type)) {
      await response.body.cancel();
      throw new ProxyError(415, 'unsupported_image');
    }
    const length = response.headers.get('Content-Length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_IMAGE_BYTES)) {
      await response.body.cancel();
      throw new ProxyError(413, 'image_too_large');
    }
    reader = response.body.getReader();
    const prefix = new Uint8Array(32);
    const initial: Uint8Array[] = [];
    let prefixSize = 0,
      size = 0,
      ended = false;
    while (prefixSize < prefix.length) {
      const part = await reader.read();
      if (part.done) {
        ended = true;
        break;
      }
      size += part.value.byteLength;
      if (size > MAX_IMAGE_BYTES) throw new ProxyError(413, 'image_too_large');
      initial.push(part.value);
      const head = part.value.subarray(0, prefix.length - prefixSize);
      prefix.set(head, prefixSize);
      prefixSize += head.length;
    }
    if (!validSignature(prefix.subarray(0, prefixSize), type))
      throw new ProxyError(415, 'unsupported_image');
    const upstream = reader;
    const stop = () => {
      clearTimeout(timer);
      abort.abort();
    };
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        initial.forEach((chunk) => controller.enqueue(chunk));
        if (ended) {
          clearTimeout(timer);
          controller.close();
        }
      },
      async pull(controller) {
        if (ended) return;
        try {
          const part = await upstream.read();
          if (part.done) {
            ended = true;
            clearTimeout(timer);
            controller.close();
            return;
          }
          size += part.value.byteLength;
          if (size > MAX_IMAGE_BYTES) throw new ProxyError(413, 'image_too_large');
          controller.enqueue(part.value);
        } catch {
          ended = true;
          stop();
          await upstream.cancel().catch(() => {});
          console.error(JSON.stringify({ event: 'image_stream_failed' }));
          controller.error(new Error('Image download failed'));
        }
      },
      async cancel() {
        ended = true;
        stop();
        await upstream.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': type,
        'Cache-Control': imageCacheControl(response.headers),
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (!(error instanceof ProxyError))
      console.error(
        JSON.stringify({
          event: 'image_fetch_failed',
          stage,
          errorType: error instanceof Error ? error.name : 'unknown',
        }),
      );
    clearTimeout(timer);
    const timedOut = abort.signal.aborted;
    abort.abort();
    await reader?.cancel().catch(() => {});
    return failure(timedOut ? new ProxyError(504, 'upstream_timeout') : error);
  }
}
