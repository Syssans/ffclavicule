/** Point d'entrée du Worker Cloudflare : voir src/sync.ts. */
import { runAlerts } from './notify';
import { error, handle, type Env } from './sync';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env).catch((e: unknown) => error(500, e instanceof Error ? e.message : 'Erreur interne.'));
  },
  /** Toutes les 10 minutes (wrangler.jsonc) : vérification des alertes de prix. */
  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(runAlerts(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
