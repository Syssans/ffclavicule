/** Requêtes HTTP communes : délai maximal et messages d'erreur lisibles. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
    /** Détail technique (adresse, code, erreur réseau d'origine), pour le diagnostic. */
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

interface RequestOptions {
  /** Nom du service, affiché dans les messages d'erreur. */
  source: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Codes HTTP renvoyés tels quels au lieu de lever une erreur (ex. 304, 404). */
  allow?: number[];
  /** Messages propres au service, par code HTTP. */
  messages?: Partial<Record<number, string>>;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: string;
}

function messageForStatus(status: number, source: string): string {
  if (status === 404) return `Introuvable sur ${source}.`;
  if (status === 403) return `${source} refuse l'accès à ces données (profil privé ?).`;
  if (status === 429) return `${source} reçoit trop de demandes, réessaie dans un instant.`;
  if (status >= 500) return `${source} rencontre un problème (erreur ${status}).`;
  return `Réponse inattendue de ${source} (erreur ${status}).`;
}

export async function request(
  url: string,
  { source, headers, timeoutMs = 15000, allow = [], messages = {}, method, body }: RequestOptions,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (error) {
    const reason = controller.signal.aborted
      ? `pas de réponse en ${timeoutMs / 1000} s`
      : error instanceof Error
        ? error.message
        : String(error);
    throw new ApiError(`Impossible de joindre ${source}. Vérifie ta connexion.`, source, undefined, `${host(url)} : ${reason}`);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok && !allow.includes(response.status)) {
    throw new ApiError(messages[response.status] ?? messageForStatus(response.status, source), source, response.status, `${host(url)} : HTTP ${response.status}`);
  }
  return response;
}

export async function getJson<T>(url: string, options: RequestOptions): Promise<T> {
  const response = await request(url, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(`Réponse illisible de ${options.source}.`, options.source, response.status, `${host(url)} : JSON invalide`);
  }
}

export async function getText(url: string, options: RequestOptions): Promise<string> {
  return (await request(url, options)).text();
}
