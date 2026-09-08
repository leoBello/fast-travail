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
