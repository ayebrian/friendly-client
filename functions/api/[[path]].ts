import { handleApiRequest, type BffEnv } from '../../bff/proxy';

/** Cloudflare Pages Function for every `/api/*` request; see bff/proxy.ts. */
export const onRequest = ({ request, env }: { request: Request; env: BffEnv }) =>
  handleApiRequest(request, env);
