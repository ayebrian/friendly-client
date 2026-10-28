/**
 * Backend-for-frontend for the Friendly API (Cloudflare Pages Function on `/api/*`).
 *
 * The Friendly backend authenticates every request with `X-Token` / `X-User-Id` headers and
 * returns the token in the JSON of `/auth/login` and `/auth/generate`. This proxy keeps that
 * token out of the browser: it moves it into an HttpOnly `__Host-` cookie on sign-in and adds
 * the headers to upstream requests itself. Page scripts only ever see `{ id, accessHash }`.
 *
 * Each account has its own cookie (`__Host-friendly-session-<id>`), so a late sign-out or 401
 * of one account can never delete the cookie of an account signed in meanwhile in another tab.
 * Signing in removes the cookies of other accounts. Requests carry a token only when the
 * client names the account with a non-secret `X-User-Id` header; a same-origin
 * `<img src="/api/…">` or a form post therefore never runs with the user's credentials.
 */

export interface BffEnv {
  /** Upstream API origin. Defaults to the public Friendly API. */
  FRIENDLY_API_ORIGIN?: string;
}

export interface BffDependencies {
  fetch?: typeof fetch;
}

export const SESSION_COOKIE_PREFIX = '__Host-friendly-session-';
export const MIGRATE_PATH = '/_session/migrate';

const DEFAULT_API_ORIGIN = 'https://api.getfriend.ly';
// Tokens do not expire on the backend; 400 days is the longest lifetime browsers accept.
const SESSION_MAX_AGE = 400 * 24 * 60 * 60;
const COOKIE_ATTRIBUTES = 'Path=/; Secure; HttpOnly; SameSite=Strict';
const SAFE_METHODS = new Set(['GET', 'HEAD']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);
// Everything else (cookies, Authorization, a client-supplied X-Token, CF/forwarding headers)
// is dropped before the request leaves Cloudflare.
const REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'x-locale',
  'x-file-size',
  'x-compatible',
];
const RESPONSE_HEADERS = ['content-type', 'content-disposition', 'content-language', 'retry-after'];
const SIGN_IN_PATHS = new Set(['/auth/login', '/auth/generate']);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const MAX_MIGRATION_BODY = 4096;

interface Session {
  id: number;
  token: string;
}

export async function handleApiRequest(
  request: Request,
  env: BffEnv = {},
  { fetch: fetcher = fetch }: BffDependencies = {},
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/')
    return failure(404, 'not_found');
  const path = url.pathname.slice('/api'.length);
  if (!ALLOWED_METHODS.has(request.method)) return failure(405, 'method_not_allowed');
  // Defence in depth next to SameSite=Strict: state changes must come from this origin.
  // Browsers always send Origin on non-GET fetches, including same-origin ones.
  if (!SAFE_METHODS.has(request.method) && request.headers.get('Origin') !== url.origin)
    return failure(403, 'origin_rejected');

  let api: URL;
  try {
    api = apiOrigin(env);
  } catch {
    return failure(500, 'misconfigured');
  }

  if (path === MIGRATE_PATH) return migrate(request, api, fetcher);
  if (path.startsWith('/_session')) return failure(404, 'not_found');

  const sessions = readSessions(request.headers.get('Cookie'));
  const claimedUser = request.headers.get('X-User-Id');
  let credentials: Session | null = null;
  if (claimedUser !== null) {
    credentials = sessions.find((session) => String(session.id) === claimedUser) ?? null;
    if (!credentials) return failure(401, 'no_session');
  }

  const target = new URL(api.origin + path + url.search);
  if (target.origin !== api.origin) return failure(400, 'bad_path');
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (credentials) {
    headers.set('X-Token', credentials.token);
    headers.set('X-User-Id', String(credentials.id));
  }

  let upstream: Response;
  try {
    upstream = await fetcher(
      new Request(target, {
        method: request.method,
        headers,
        body: SAFE_METHODS.has(request.method) ? null : request.body,
        redirect: 'manual',
        signal: request.signal,
        // Stream uploads instead of buffering them (required by undici, ignored by workerd).
        duplex: 'half',
      } as RequestInit),
    );
  } catch {
    return failure(502, 'upstream_unreachable');
  }

  if (request.method === 'POST' && SIGN_IN_PATHS.has(path) && upstream.ok)
    return signIn(upstream, sessions);

  const response = forward(upstream);
  // A rejected token is gone for good (the backend has no refresh); drop its cookie with it.
  // Sign-out ends the cookie once the backend has revoked the token.
  if (credentials && (upstream.status === 401 || (path === '/auth/logout' && upstream.ok)))
    response.headers.append('Set-Cookie', clearCookie(credentials.id));
  return response;
}

/**
 * Moves the token from a sign-in response into the account's cookie, removes the cookies of
 * other accounts and returns the rest of the body.
 */
async function signIn(upstream: Response, previous: Session[]): Promise<Response> {
  let body: unknown;
  try {
    body = JSON.parse(await upstream.text());
  } catch {
    return failure(502, 'bad_upstream_response');
  }
  if (!isRecord(body) || !isUserId(body.id) || !isToken(body.token))
    return failure(502, 'bad_upstream_response');
  const { token, ...account } = body;
  const response = json(upstream.status, account);
  response.headers.append('Set-Cookie', sessionCookie({ id: body.id, token }));
  for (const session of previous)
    if (session.id !== body.id) response.headers.append('Set-Cookie', clearCookie(session.id));
  return response;
}

/**
 * One-time move of a token that an earlier build kept in sessionStorage. The token is checked
 * against the backend before it becomes a cookie, and the response carries only the account.
 * Other accounts' cookies are left alone: another tab may have signed in meanwhile.
 */
async function migrate(request: Request, api: URL, fetcher: typeof fetch): Promise<Response> {
  if (request.method !== 'POST') return failure(405, 'method_not_allowed');
  const text = await readLimited(request, MAX_MIGRATION_BODY);
  if (text === null) return failure(413, 'too_large');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return failure(400, 'bad_request');
  }
  if (!isRecord(body) || !isUserId(body.id) || !isToken(body.token))
    return failure(400, 'bad_request');
  const session = { id: body.id, token: body.token };
  let upstream: Response;
  try {
    upstream = await fetcher(
      new Request(`${api.origin}/users/details2`, {
        headers: {
          Accept: 'application/json',
          'X-Token': session.token,
          'X-User-Id': String(session.id),
        },
        redirect: 'manual',
        signal: request.signal,
      }),
    );
  } catch {
    return failure(502, 'upstream_unreachable');
  }
  if (upstream.status === 401 || upstream.status === 403) return failure(401, 'invalid_session');
  if (!upstream.ok) return failure(502, 'upstream_error');
  let profile: unknown;
  try {
    profile = JSON.parse(await upstream.text());
  } catch {
    return failure(502, 'bad_upstream_response');
  }
  const user = isRecord(profile) && isRecord(profile.user) ? profile.user : null;
  if (!user || user.id !== session.id || typeof user.accessHash !== 'string' || !user.accessHash)
    return failure(502, 'bad_upstream_response');
  const response = json(200, { id: session.id, accessHash: user.accessHash });
  response.headers.append('Set-Cookie', sessionCookie(session));
  return response;
}

/** Reads at most `limit` bytes of the body; returns null (and stops reading) above it. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && !(Number(declared) <= limit)) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function forward(upstream: Response): Response {
  const headers = baseHeaders();
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  return new Response(NULL_BODY_STATUSES.has(upstream.status) ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

function apiOrigin(env: BffEnv): URL {
  const api = new URL(env.FRIENDLY_API_ORIGIN || DEFAULT_API_ORIGIN);
  if (api.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(api.hostname))
    throw new Error('FRIENDLY_API_ORIGIN must use HTTPS.');
  if (api.username || api.password) throw new Error('FRIENDLY_API_ORIGIN has credentials.');
  return api;
}

/** All well-formed session cookies of the request; a malformed one counts as absent. */
export function readSessions(cookieHeader: string | null): Session[] {
  const sessions: Session[] = [];
  for (const part of (cookieHeader ?? '').split(';')) {
    const separator = part.indexOf('=');
    const name = part.slice(0, separator).trim();
    if (separator < 0 || !name.startsWith(SESSION_COOKIE_PREFIX)) continue;
    try {
      const value: unknown = JSON.parse(base64UrlDecode(part.slice(separator + 1).trim()));
      if (
        isRecord(value) &&
        isUserId(value.id) &&
        isToken(value.token) &&
        name === cookieName(value.id) &&
        !sessions.some((session) => session.id === value.id)
      )
        sessions.push({ id: value.id, token: value.token });
    } catch {
      /* Ignore a malformed cookie. */
    }
  }
  return sessions;
}

function cookieName(id: number) {
  return `${SESSION_COOKIE_PREFIX}${id}`;
}

function sessionCookie(session: Session) {
  const value = base64UrlEncode(JSON.stringify({ id: session.id, token: session.token }));
  return `${cookieName(session.id)}=${value}; Max-Age=${SESSION_MAX_AGE}; ${COOKIE_ATTRIBUTES}`;
}

function clearCookie(id: number) {
  return `${cookieName(id)}=; Max-Age=0; ${COOKIE_ATTRIBUTES}`;
}

function baseHeaders() {
  return new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
}

function json(status: number, body: unknown) {
  const headers = baseHeaders();
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

function failure(status: number, error: string) {
  return json(status, { error });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isUserId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1024;
}

function base64UrlEncode(text: string) {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}
