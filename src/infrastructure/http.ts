import { ApiError } from '../shared/errors';
import type { Authorization } from '../domain/models';

export interface HttpOptions {
  baseUrl: string;
  authorization?: Authorization;
  onUnauthorized?: () => void;
  fetcher?: typeof fetch;
}

export function createHttp({
  baseUrl,
  authorization,
  onUnauthorized,
  fetcher = fetch,
}: HttpOptions) {
  return async function request(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    if (authorization) {
      headers.set('X-Token', authorization.token);
      headers.set('X-User-Id', String(authorization.id));
    }
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, {
        ...options,
        headers,
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      throw new ApiError(0, 'Нет связи с Friendly. Проверьте подключение и повторите попытку.');
    }
    if (!response.ok) {
      if (response.status === 401 && authorization) onUnauthorized?.();
      const messages: Record<number, string> = {
        400: 'Проверьте введённые данные.',
        401: authorization
          ? 'Сессия завершилась. Войдите снова.'
          : 'Аккаунт с этой почтой не найден.',
        403: 'Доступ запрещён или код входа истёк.',
        404: 'Запись не найдена.',
        429: 'Слишком много запросов. Подождите немного.',
      };
      throw new ApiError(
        response.status,
        messages[response.status] ?? 'Friendly временно недоступен. Попробуйте позже.',
      );
    }
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ApiError(502, 'Friendly вернул ответ в неожиданном формате.');
    }
  };
}
