const MAX_TTL = 3600;
// Consume one complete directive, including quoted values containing commas.
const DIRECTIVE = /^\s*([!#$%&'*+.^_`|~\w-]+)(?:\s*=\s*("(?:[^"\\]|\\.)*"|[^,\s"]+))?\s*(?:,|$)/;

/** Use the stricter shared/browser lifetime; never turn an invalid policy into an hour. */
export function imageCacheControl(headers: Headers) {
  if (headers.has('Set-Cookie')) return 'no-store';
  let remaining = headers.get('Cache-Control')?.trim() ?? '';
  let ttl = MAX_TTL;
  const seen = new Set<string>();
  while (remaining) {
    const match = DIRECTIVE.exec(remaining);
    if (!match) return 'no-store';
    remaining = remaining.slice(match[0].length);
    const name = match[1].toLowerCase();
    if (['private', 'no-store', 'no-cache'].includes(name)) return 'no-store';
    if (name !== 'max-age' && name !== 's-maxage') continue;
    if (seen.has(name)) return 'no-store';
    seen.add(name);
    const value = match[2]?.replace(/^"|"$/g, '');
    if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return 'no-store';
    ttl = Math.min(ttl, Number(value));
  }

  // Upstream CDN time already consumed part of the origin's freshness lifetime.
  const age = headers.get('Age') ?? '0';
  if (!/^\d+$/.test(age) || !Number.isSafeInteger(Number(age))) return 'no-store';
  ttl = Math.max(0, ttl - Number(age));
  return ttl === 0 ? 'no-store' : `public, max-age=${ttl}, must-revalidate`;
}
