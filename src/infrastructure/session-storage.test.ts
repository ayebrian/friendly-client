// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from './session-storage';

const key = 'friendly.session.v1';
const auth = { id: 1, token: 'test-token', accessHash: 'test-hash' };
const nextAuth = { id: 2, token: 'next-token', accessHash: 'next-hash' };

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('sessionStore', () => {
  it('does not replace an account another tab signed in with a sign-out marker', () => {
    localStorage.setItem(key, JSON.stringify(nextAuth));
    sessionStore.beginLogout(auth);
    expect(sessionStore.read()).toEqual({ authorization: nextAuth, pendingLogout: false });
    sessionStore.restoreAfterFailedLogout(auth);
    sessionStore.clear(auth);
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(nextAuth);
  });

  it('drops a leftover tab copy once the shared copy exists', () => {
    localStorage.setItem(key, JSON.stringify(nextAuth));
    sessionStorage.setItem(key, JSON.stringify(auth));
    expect(sessionStore.read()?.authorization).toEqual(nextAuth);
    expect(sessionStorage.getItem(key)).toBeNull();
    localStorage.removeItem(key);
    expect(sessionStore.read()).toBeNull();
  });

  it('falls back to the tab when localStorage rejects writes', () => {
    localStorage.setItem(key, JSON.stringify(auth));
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k, v) {
      if (this === localStorage) throw new DOMException('Quota', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    sessionStore.write(nextAuth);
    expect(sessionStore.read()?.authorization).toEqual(nextAuth);
  });
});
