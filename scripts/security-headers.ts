import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Generate Cloudflare Pages headers from the final HTML, including its theme script. */
export function securityHeaders(): Plugin {
  let outputDirectory = '';
  let apiOrigin = '';
  let proxyOrigin = '';
  return {
    name: 'friendly-security-headers',
    configResolved(config) {
      outputDirectory = resolve(config.root, config.build.outDir);
      const api = new URL(config.env.VITE_API_BASE_URL || 'https://api.getfriend.ly');
      if (!['https:', 'http:'].includes(api.protocol) || api.username || api.password)
        throw new Error('VITE_API_BASE_URL must be a public HTTP(S) API URL.');
      apiOrigin = api.origin;
      const proxyUrl = config.env.VITE_IMAGE_PROXY_URL;
      if (proxyUrl) {
        const proxy = new URL(proxyUrl);
        const localHttp =
          proxy.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(proxy.hostname);
        if (
          (!localHttp && proxy.protocol !== 'https:') ||
          proxy.username ||
          proxy.password ||
          proxy.search ||
          proxy.hash
        )
          throw new Error(
            'VITE_IMAGE_PROXY_URL must be an HTTPS endpoint (or local HTTP for development), without credentials, query or fragment.',
          );
        proxyOrigin = proxy.origin;
      }
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset') throw new Error('Missing HTML for CSP generation.');
        const html =
          typeof index.source === 'string' ? index.source : Buffer.from(index.source).toString();
        const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
          .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim())
          .map((match) => `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
        if (!hashes.length) throw new Error('Missing initial theme script for CSP.');
        const policy = [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`,
          "script-src-attr 'none'",
          // Radix inserts scroll-lock styles dynamically, and React uses style attributes.
          // Inline styles are allowed; executable inline scripts remain hash-restricted.
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self'",
          `img-src 'self' blob: https: ${apiOrigin}${proxyOrigin ? ` ${proxyOrigin}` : ''}`,
          `media-src 'self' blob: https: ${apiOrigin}`,
          // API calls go through the same-origin /api proxy; only Firebase push is external.
          "connect-src 'self' https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com",
          "worker-src 'self'",
          "object-src 'none'",
          "base-uri 'none'",
          "form-action 'self'",
          "frame-ancestors 'none'",
          'upgrade-insecure-requests',
        ].join('; ');
        this.emitFile({
          type: 'asset',
          fileName: '_headers',
          source: `/*\n  Content-Security-Policy: ${policy}\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`,
        });
      },
    },
    // Vite does not read Pages' _headers. Apply the generated policy to preview as well.
    configurePreviewServer(server) {
      const headers = readFileSync(resolve(outputDirectory, '_headers'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('  '))
        .map((line) => {
          const separator = line.indexOf(':');
          return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] as const;
        });
      server.middlewares.use((_request, response, next) => {
        headers.forEach(([name, value]) => response.setHeader(name, value));
        next();
      });
    },
  };
}
