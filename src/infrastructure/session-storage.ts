import { authorizationSchema } from './friendly-gateway';
import type { Authorization } from '../domain/models';

const key = 'friendly.session.v1';
export type StoredSession = { authorization: Authorization; pendingLogout: boolean };

export function sameAuthorization(left: Authorization, right: Authorization) {
  return left.id === right.id && left.token === right.token;
}

function parse(raw: string | null): StoredSession | null {
  try {
    const value = JSON.parse(raw ?? 'null') as unknown;
    const pendingLogout = !!value && typeof value === 'object' && 'pendingLogout' in value;
    const authorization = pendingLogout
      ? (value as { pendingLogout: unknown }).pendingLogout
      : value;
    const parsed = authorizationSchema.safeParse(authorization);
    return parsed.success ? { authorization: parsed.data, pendingLogout } : null;
  } catch {
    return null;
  }
}

function get(storage: () => Storage) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the browser refuses the write (blocked storage, quota). */
function put(storage: () => Storage, value: string | null) {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

const local = () => localStorage;
const tab = () => sessionStorage;

function save(value: string | null) {
  // Builds before this one kept the session only in the tab; never leave a stale copy there.
  if (put(local, value)) {
    put(tab, null);
    return true;
  }
  // localStorage refuses writes (blocked, quota): drop its copy so read() sees the tab's,
  // then fall back to the tab and finally to memory only.
  put(local, null);
  return put(tab, value);
}

/**
 * Account persistence shared by every tab of this origin, so a new tab, a notification
 * click or a browser restart keeps the user signed in until they sign out or the server
 * rejects the token. No credentials are written to logs or URLs.
 */
export const sessionStore = {
  read(): StoredSession | null {
    const stored = get(local);
    if (stored !== null) {
      // The shared copy wins; a leftover tab copy could later resurrect an older account.
      if (get(tab) !== null) put(tab, null);
      return parse(stored);
    }
    const legacy = get(tab);
    if (legacy === null) return null;
    const session = parse(legacy);
    // Move a session saved by an earlier tab-scoped build instead of signing the user out.
    if (session) save(legacy);
    return session;
  },
  write(value: Authorization | null) {
    save(value ? JSON.stringify(value) : null);
  },
  /** Clears the stored account only if it still belongs to `value`; another tab may have signed in. */
  clear(value: Authorization) {
    const current = this.read();
    if (!current || sameAuthorization(current.authorization, value)) this.write(null);
  },
  beginLogout(value: Authorization) {
    const current = this.read();
    // Another tab has already switched the stored account; revoke `value` without touching it.
    if (current && !sameAuthorization(current.authorization, value)) return;
    // A failed marker write must not leave a restorable active session behind.
    if (!save(JSON.stringify({ pendingLogout: value }))) this.write(null);
  },
  restoreAfterFailedLogout(value: Authorization) {
    const current = this.read();
    if (current?.pendingLogout && sameAuthorization(current.authorization, value))
      this.write(value);
  },
  /** Calls `listener` when another tab signs in, starts signing out or signs out. */
  subscribe(listener: (session: StoredSession | null) => void) {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        if (event.storageArea !== localStorage) return;
      } catch {
        return;
      }
      // Events can arrive late; current storage, not event.newValue, is the truth.
      listener(sessionStore.read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  },
};
