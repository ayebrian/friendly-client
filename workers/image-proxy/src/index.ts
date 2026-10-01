import { WorkerEntrypoint } from 'cloudflare:workers';
import { failure, imageUrl, loadImage, ProxyError } from './source';

export class ImageCache extends WorkerEntrypoint<Env, { proxyHost: string }> {
  fetch(request: Request) {
    const source = new URL(request.url).searchParams.get('url');
    return source
      ? loadImage(source, this.ctx.props.proxyHost)
      : failure(new ProxyError(400, 'invalid_url'));
  }
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);
    if (!origin || !env.APP_ORIGINS.some((allowed) => allowed === origin))
      return failure(new ProxyError(403, 'forbidden_origin'));
    const cors = (response: Response) => {
      const headers = new Headers(response.headers);
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
      if (response.status === 200 && headers.get('Cache-Control') !== 'no-store')
        headers.set('Cache-Control', headers.get('Cache-Control')!.replace('public,', 'private,'));
      return new Response(response.body, { status: response.status, headers });
    };
    if (url.pathname !== '/image') return cors(failure(new ProxyError(404, 'not_found')));
    if (request.method === 'OPTIONS')
      return cors(
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Methods': 'GET',
            'Access-Control-Max-Age': '600',
            'Cache-Control': 'no-store',
          },
        }),
      );
    if (request.method !== 'GET') return cors(failure(new ProxyError(405, 'method_not_allowed')));
    try {
      const source = url.searchParams.get('url');
      if (
        !source ||
        [...url.searchParams.keys()].some((key) => key !== 'url') ||
        url.searchParams.getAll('url').length !== 1
      )
        throw new ProxyError(400, 'invalid_url');
      const target = imageUrl(source, url.hostname);
      const { success } = await env.IMAGE_RATE_LIMITER.limit({
        key: request.headers.get('CF-Connecting-IP') || 'unknown',
      });
      if (!success) throw new ProxyError(429, 'rate_limited');
      const canonical = new URL('/image', url.origin);
      canonical.searchParams.set('url', target.href);
      return cors(
        await ctx.exports.ImageCache({ props: { proxyHost: url.hostname } }).fetch(canonical),
      );
    } catch (error) {
      if (!(error instanceof ProxyError))
        console.error(
          JSON.stringify({
            event: 'image_gateway_failed',
            errorType: error instanceof Error ? error.name : 'unknown',
          }),
        );
      return cors(failure(error));
    }
  },
} satisfies ExportedHandler<Env>;
