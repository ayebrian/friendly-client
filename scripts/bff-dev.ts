import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadEnv, type Connect, type Plugin } from 'vite';
import { handleApiRequest } from '../bff/proxy.ts';

/**
 * Serves `/api/*` from the same proxy code as the Pages Function, so `npm run dev` and
 * `vite preview` work without wrangler. The upstream comes from FRIENDLY_API_ORIGIN (process
 * environment or `.env*` files).
 *
 * The session cookie is `Secure`: Chromium and Firefox accept it on http://localhost and
 * http://127.0.0.1; Safari does not, so sign in from one of the former during development.
 */
export function bffDevServer(): Plugin {
  let upstream: string | undefined;
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    if (!request.url?.startsWith('/api/')) return next();
    void serve(request, response, upstream).catch(next);
  };
  return {
    name: 'friendly-bff-dev',
    configResolved(config) {
      upstream = loadEnv(config.mode, config.envDir || config.root, '').FRIENDLY_API_ORIGIN;
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

async function serve(
  request: IncomingMessage,
  response: ServerResponse,
  upstream: string | undefined,
) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  const method = request.method ?? 'GET';
  const abort = new AbortController();
  response.on('close', () => abort.abort());
  const result = await handleApiRequest(
    new Request(`http://${request.headers.host ?? '127.0.0.1'}${request.url}`, {
      method,
      headers,
      body: ['GET', 'HEAD'].includes(method) ? null : (Readable.toWeb(request) as ReadableStream),
      signal: abort.signal,
      duplex: 'half',
    } as RequestInit),
    { FRIENDLY_API_ORIGIN: upstream },
  );
  response.statusCode = result.status;
  result.headers.forEach((value, name) => {
    if (name !== 'set-cookie') response.setHeader(name, value);
  });
  const cookies = result.headers.getSetCookie();
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  if (!result.body) return void response.end();
  Readable.fromWeb(result.body as Parameters<typeof Readable.fromWeb>[0]).pipe(response);
}
