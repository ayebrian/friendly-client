import { authorizationSchema } from './friendly-gateway';
import type { Authorization } from '../domain/models';

const key = 'friendly.session.v1';
type StoredSession = { authorization: Authorization; pendingLogout: boolean };

function sameAuthorization(left: Authorization, right: Authorization) {
  return left.id === right.id && left.token === right.token;
}

/** Tab-scoped persistence. No credentials are written to logs or URLs. */
export const sessionStorageAdapter = {
  read(): StoredSession | null {
    try {
      const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as unknown;
      const pendingLogout = !!value && typeof value === 'object' && 'pendingLogout' in value;
      const authorization = pendingLogout
        ? (value as { pendingLogout: unknown }).pendingLogout
        : value;
      const parsed = authorizationSchema.safeParse(authorization);
      return parsed.success ? { authorization: parsed.data, pendingLogout } : null;
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
  beginLogout(value: Authorization) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ pendingLogout: value }));
    } catch {
      // A failed marker write must not leave a restorable active session behind.
      try {
        sessionStorage.removeItem(key);
      } catch {
        /* The in-memory session still ends when this tab closes. */
      }
    }
  },
  restoreAfterFailedLogout(value: Authorization) {
    const current = this.read();
    if (current?.pendingLogout && sameAuthorization(current.authorization, value))
      this.write(value);
  },
};
