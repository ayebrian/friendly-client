import { z } from 'zod';
import { authorizationSchema } from './friendly-gateway';
import type { Authorization } from '../domain/models';

/**
 * Which account this browser is signed in to. It holds only `{ id, accessHash }`: the API
 * token lives in the proxy's HttpOnly cookie, which every tab of the origin shares. The
 * marker is in localStorage so that all tabs show the same account as that cookie.
 */
const key = 'friendly.session.v2';
/** Earlier builds kept `{ id, token, accessHash }` in the tab's sessionStorage. */
const legacyKey = 'friendly.session.v1';

export type StoredSession = { authorization: Authorization; pendingLogout: boolean };

export function sameAuthorization(left: Authorization, right: Authorization) {
  return left.id === right.id && left.accessHash === right.accessHash;
}

// Store exactly the account fields, whatever object the caller holds.
const account = ({ id, accessHash }: Authorization): Authorization => ({ id, accessHash });

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

// Used only while localStorage refuses access (blocked storage, quota): the cookie session
// then lasts for this document, as before.
let memory: string | null = null;
let memoryOnly = false;

function load() {
  if (!memoryOnly) {
    try {
      return localStorage.getItem(key);
    } catch {
      /* Fall back to memory below. */
    }
  }
  return memory;
}

function save(value: string | null) {
  memory = value;
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    memoryOnly = false;
    return true;
  } catch {
    memoryOnly = true;
    try {
      // Never leave an older account behind for read() or other tabs.
      localStorage.removeItem(key);
    } catch {
      /* Storage is unavailable altogether. */
    }
    return false;
  }
}

export const sessionStore = {
  read(): StoredSession | null {
    const session = parse(load());
    // The cookie session wins over a readable token an earlier build left in this tab.
    if (session) clearLegacySession();
    return session;
  },
  write(value: Authorization | null) {
    save(value ? JSON.stringify(account(value)) : null);
    // A fresh sign-in or sign-out supersedes any token an earlier build left in this tab.
    clearLegacySession();
  },
  /** Clears the stored account only if it still is `value`; another tab may have signed in. */
  clear(value: Authorization) {
    const current = this.read();
    if (!current || sameAuthorization(current.authorization, value)) this.write(null);
  },
  beginLogout(value: Authorization) {
    const current = this.read();
    // Another tab has already switched the stored account; revoke `value` without touching it.
    if (current && !sameAuthorization(current.authorization, value)) return;
    // A failed marker write must not leave a restorable active session behind.
    if (!save(JSON.stringify({ pendingLogout: account(value) }))) save(null);
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

const legacySchema = z.object({
  id: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  token: z.string().min(1),
  accessHash: z.string().min(1),
});

function readLegacySession() {
  try {
    const raw = sessionStorage.getItem(legacyKey);
    if (raw === null) return null;
    const value = JSON.parse(raw) as unknown;
    const pendingLogout = !!value && typeof value === 'object' && 'pendingLogout' in value;
    const parsed = legacySchema.safeParse(
      pendingLogout ? (value as { pendingLogout: unknown }).pendingLogout : value,
    );
    if (parsed.success) return { ...parsed.data, pendingLogout };
    clearLegacySession();
    return null;
  } catch {
    return null;
  }
}

function clearLegacySession() {
  try {
    sessionStorage.removeItem(legacyKey);
  } catch {
    /* Nothing to clear when storage is blocked. */
  }
}

/** True when this tab still holds a token saved by an earlier build. */
export function hasLegacySession() {
  return readLegacySession() !== null;
}

let migration: Promise<StoredSession | null> | null = null;

/**
 * Hands a token saved by an earlier build to the proxy, which checks it and keeps it in the
 * HttpOnly cookie, then deletes the readable copy. A rejected token is deleted as well; after
 * a network or server failure or a timeout it stays for the next page load and the tab
 * starts signed out. An account signed in by another tab always wins over the migrated one.
 */
export function migrateLegacySession(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  timeout = 15_000,
) {
  migration ??= (async () => {
    // read() drops the readable copy when another tab has already signed in.
    const current = sessionStore.read();
    if (current) return current;
    const legacy = readLegacySession();
    if (!legacy) return null;
    let authorization: Authorization;
    try {
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/_session/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: legacy.id, token: legacy.token }),
        // Covers the response body too; the restoring screen must not wait forever.
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) {
        if ([400, 401, 403].includes(response.status)) clearLegacySession();
        return null;
      }
      authorization = authorizationSchema.parse(await response.json());
    } catch {
      return null;
    }
    // Another tab signed in while this request was pending: its account wins. The migrated
    // account's cookie stays unused until the next sign-in removes it. (A sign-out in another
    // tab cannot be told apart here; the earlier tab-scoped session would have survived it.)
    const now = sessionStore.read();
    if (now) return now;
    if (legacy.pendingLogout) {
      save(JSON.stringify({ pendingLogout: account(authorization) }));
      clearLegacySession();
    } else sessionStore.write(authorization);
    return { authorization, pendingLogout: legacy.pendingLogout };
  })().finally(() => {
    migration = null;
  });
  return migration;
}
