import type { FileDescriptor, Person } from '../domain/models';

export const postPath = (post: FileDescriptor) =>
  `/post/${post.id}/${encodeURIComponent(post.accessHash)}`;
export const personPath = (person: Person) =>
  `/people/${person.id}/${encodeURIComponent(person.accessHash ?? '')}`;

export function safeExternalLink(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function parseInvitation(value: string): { userId: number; token: string } | null {
  try {
    let reference = value.trim();
    if (/^https?:\/\//i.test(reference)) {
      const url = new URL(reference);
      reference =
        new URLSearchParams(url.hash.replace(/^#\??/, '')).get('reference') ??
        decodeURIComponent(url.pathname.replace(/^\/redirect\//, ''));
    }
    const match = /^add\/(\d+)\/([^/\s]+)$/.exec(reference);
    if (!match) return null;
    const userId = Number(match[1]);
    return Number.isSafeInteger(userId) && userId > 0 ? { userId, token: match[2] } : null;
  } catch {
    return null;
  }
}
