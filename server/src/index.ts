/** Point d'entrée du Worker Cloudflare : voir src/sync.ts. */
import { error, handle, type Env } from './sync';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env).catch((e: unknown) => error(500, e instanceof Error ? e.message : 'Erreur interne.'));
  },
} satisfies ExportedHandler<Env>;
