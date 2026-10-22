/** Requêtes HTTP communes : délai maximal et messages d'erreur lisibles. */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  /** Nom du service, affiché dans les messages d'erreur. */
  source: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function messageForStatus(status: number, source: string): string {
  if (status === 404) return `Introuvable sur ${source}.`;
  if (status === 403) return `${source} refuse l'accès à ces données (profil privé ?).`;
  if (status === 429) return `${source} reçoit trop de demandes, réessaie dans un instant.`;
  if (status >= 500) return `${source} rencontre un problème (erreur ${status}).`;
  return `Réponse inattendue de ${source} (erreur ${status}).`;
}

export async function request(url: string, { source, headers, timeoutMs = 15000 }: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: controller.signal });
  } catch {
    throw new ApiError(`Impossible de joindre ${source}. Vérifie ta connexion.`, source);
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new ApiError(messageForStatus(response.status, source), source, response.status);
  return response;
}

export async function getJson<T>(url: string, options: RequestOptions): Promise<T> {
  const response = await request(url, options);
  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError(`Réponse illisible de ${options.source}.`, options.source, response.status);
  }
}

export async function getText(url: string, options: RequestOptions): Promise<string> {
  return (await request(url, options)).text();
}
