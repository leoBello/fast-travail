/**
 * Client Claude minimal, en fetch injecte comme tous les clients du depot.
 * Ce fichier est runtime-neutre : il ne lit jamais l'environnement.
 *
 * Deux faits mesures le 2026-09-08, contre l'API reelle :
 * - l'en-tete `anthropic-workspace-id` est OBLIGATOIRE avec la cle du projet,
 *   qui n'est rattachee a aucun workspace. Sans lui : HTTP 400.
 * - la sortie structuree se demande par `output_config.format` de type
 *   `json_schema`, et revient dans `content[0].text` comme chaine JSON.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface ClaudeConfig {
  apiKey: string;
  workspaceId: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface StructuredCall {
  systemBlocks: SystemBlock[];
  userText: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}

export interface ClaudeUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

export interface ClaudeResult<T> {
  value: T;
  usage: ClaudeUsage;
}

export class ClaudeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
  }
}

/**
 * Un echec est-il REJOUABLE, c'est-a-dire raisonnablement imputable a
 * l'environnement plutot qu'a cette offre-ci ?
 *
 * La distinction n'est pas cosmetique : l'appelant ecrit une ligne d'erreur
 * pour un echec PERMANENT — ce qui sort l'offre de `offers_ai_candidates`
 * jusqu'au prochain changement de version, donc potentiellement pour toujours
 * — et n'ecrit RIEN pour un echec rejouable, laissant l'offre candidate au
 * prochain passage. Se tromper dans un sens perd une offre definitivement ;
 * se tromper dans l'autre coute un centime et un tour de plus.
 *
 * La regle : un echec est PERMANENT quand il est attribuable au contenu de
 * l'offre ou a l'appel lui-meme — un 4xx autre que 429 (schema refuse, requete
 * malformee, cle revoquee), ou une reponse HTTP 200 qu'on n'a pas su lire
 * (JSON tronque, sortie structuree illisible). Tout le reste est rejouable :
 *
 *   * 429 : quota ou limite de debit. Rejouable par definition.
 *   * 5xx (500, 502, 503, 529 de surcharge) : panne cote API.
 *   * statut 0 : aucun echange HTTP n'a eu lieu (configuration absente).
 *   * n'importe quelle exception qui n'est PAS une ClaudeApiError : `fetch`
 *     qui echoue sur une coupure reseau, un DNS, un abandon. Rien n'a ete
 *     juge, donc rien ne justifie de condamner l'offre.
 *
 * Le repli par defaut est donc « rejouable », qui est le cote sur : au pire
 * l'offre revient et coute un appel de plus ; les fusibles de `run-backfill`
 * arretent de toute facon une boucle qui n'avance pas.
 */
export function isRetryableFailure(cause: unknown): boolean {
  if (!(cause instanceof ClaudeApiError)) return true;
  if (cause.status === 429) return true;
  if (cause.status >= 500) return true;
  if (cause.status === 0) return true;
  return false;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

export async function callClaudeStructured<T>(
  cfg: ClaudeConfig,
  call: StructuredCall,
): Promise<ClaudeResult<T>> {
  if (!cfg.apiKey) throw new ClaudeApiError('ClaudeConfig.apiKey manquant', 0);
  if (!cfg.workspaceId) throw new ClaudeApiError('ClaudeConfig.workspaceId manquant', 0);

  const doFetch = cfg.fetchImpl ?? fetch;
  const response = await doFetch(cfg.baseUrl ?? ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': cfg.apiKey,
      'anthropic-workspace-id': cfg.workspaceId,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: call.maxTokens,
      system: call.systemBlocks,
      messages: [{ role: 'user', content: call.userText }],
      output_config: { format: { type: 'json_schema', schema: call.schema } },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new ClaudeApiError(`Claude a repondu ${response.status} : ${detail}`, response.status);
  }

  let payload: AnthropicResponse;
  try {
    payload = (await response.json()) as AnthropicResponse;
  } catch (cause) {
    throw new ClaudeApiError(`reponse Claude illisible : ${String(cause)}`, response.status);
  }

  // Mesure du 2026-09-08 sur 1 269 appels reels : 75 (5,9 %) echouaient avec
  // un JSON coupe en plein milieu, ou meme sans aucun bloc de texte. La cause
  // est un plafond de sortie trop bas (voir MAX_TOKENS dans run-scoring.ts) :
  // `claude-sonnet-5` emet un bloc `thinking` AVANT le bloc `text`, et les
  // deux puisent dans le MEME budget de sortie — quand la reflexion en
  // consomme trop, le JSON s'arrete au milieu, ou n'a jamais commence.
  // L'API le dit sans ambiguite via `stop_reason: "max_tokens"` : verifier
  // ce cas AVANT de chercher un bloc de texte ou de tenter le JSON.parse
  // evite de faire passer une troncature de budget pour un JSON malforme.
  if (payload.stop_reason === 'max_tokens') {
    throw new ClaudeApiError(
      'reponse tronquee : le plafond de max_tokens a ete atteint',
      response.status,
    );
  }

  const textBlock = payload.content?.find((block) => block.type === 'text');
  if (textBlock === undefined) {
    throw new ClaudeApiError('reponse Claude sans bloc de texte', response.status);
  }
  const text = textBlock.text;
  if (!text) {
    throw new ClaudeApiError('reponse Claude avec un bloc de texte vide', response.status);
  }

  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch (cause) {
    throw new ClaudeApiError(`sortie structuree illisible : ${String(cause)}`, response.status);
  }

  const usage = payload.usage ?? {};
  return {
    value,
    usage: {
      inputTokens: usage.input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      cacheReadInputTokens: usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
    },
  };
}
