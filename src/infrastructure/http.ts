import { ApiError } from '../shared/errors';
import type { Authorization } from '../domain/models';

export interface HttpOptions {
  baseUrl: string;
  authorization?: Authorization;
  onUnauthorized?: () => void;
  fetcher?: typeof fetch;
  sessionSignal?: () => AbortSignal;
}

export function createHttp({
  baseUrl,
  authorization,
  onUnauthorized,
  fetcher = fetch,
  sessionSignal,
}: HttpOptions) {
  return async function request(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData))
      headers.set('Content-Type', 'application/json');
    if (authorization) {
      headers.set('X-Token', authorization.token);
      headers.set('X-User-Id', String(authorization.id));
    }
    const lifetime = sessionSignal?.();
    const signal = AbortSignal.any([
      AbortSignal.timeout(options.body instanceof FormData ? 60_000 : 15_000),
      ...(options.signal ? [options.signal] : []),
      ...(lifetime ? [lifetime] : []),
    ]);
    signal.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, {
        ...options,
        headers,
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted || lifetime?.aborted) throw error;
      throw new ApiError(0, 'Cannot connect to Friendly. Check your connection and try again.');
    }
    signal.throwIfAborted();
    if (!response.ok) {
      if (response.status === 401 && authorization) onUnauthorized?.();
      const messages: Record<number, string> = {
        400: 'Please check the information you entered.',
        401: authorization
          ? 'Your session has ended. Please sign in again.'
          : 'No account was found for this email.',
        403: 'Access denied or your sign-in code has expired.',
        404: 'This item could not be found.',
        429: 'Too many requests. Please wait a moment.',
      };
      throw new ApiError(
        response.status,
        messages[response.status] ?? 'Friendly is temporarily unavailable. Please try again later.',
      );
    }
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(502, 'Friendly returned an unexpected response.');
    }
  };
}
