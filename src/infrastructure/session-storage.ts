import { authorizationSchema } from './friendly-gateway';
import type { Authorization } from '../domain/models';

const key = 'friendly.session.v1';

/** Tab-scoped persistence. No credentials are written to logs or URLs. */
export const sessionStorageAdapter = {
  read(): Authorization | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown;
      const parsed = authorizationSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  },
  write(value: Authorization | null) {
    try {
      if (value) sessionStorage.setItem(key, JSON.stringify(value));
      else sessionStorage.removeItem(key);
    } catch {
      /* Memory session still works when browser storage is blocked. */
    }
  },
};
