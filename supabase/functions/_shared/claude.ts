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

  /**
   * L'echec est-il attribuable au CONTENU de l'offre, au point qu'un nouvel
   * essai sur le meme texte donnerait le meme resultat ?
   *
   * Le statut HTTP ne suffit pas a le dire : un refus du modele et une reponse
   * tronquee portent tous deux 200, et seul le premier est deterministe. D'ou
   * ce drapeau explicite. Le porter dans le TYPE plutot que de le deduire du
   * message evite de faire dependre une decision de facturation — repayer ou
   * condamner une offre — d'une comparaison de chaines de caracteres.
   */
  readonly permanent: boolean;

  constructor(message: string, status: number, permanent = false) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = status;
    this.permanent = permanent;
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
 * l'offre — un 4xx autre que 429 (schema refuse, requete malformee, cle
 * revoquee), ou un refus explicite du modele. Tout le reste est rejouable :
 *
 *   * 429 : quota ou limite de debit. Rejouable par definition.
 *   * 5xx (500, 502, 503, 529 de surcharge) : panne cote API.
 *   * statut 0 : aucun echange HTTP n'a eu lieu (configuration absente).
 *   * statut 200 illisible : voir le renversement ci-dessous.
 *   * n'importe quelle exception qui n'est PAS une ClaudeApiError : `fetch`
 *     qui echoue sur une coupure reseau, un DNS, un abandon. Rien n'a ete
 *     juge, donc rien ne justifie de condamner l'offre.
 *
 * CE QUE LA MESURE A RENVERSE — 2026-09-10, P31 dans ETAT.md
 *
 * Cette fonction classait un HTTP 200 illisible comme PERMANENT, au motif
 * qu'une reponse recue mais incomprehensible etait imputable a l'offre. C'est
 * faux, et le prix en etait eleve : 18 offres perdues en deux jours, dont 7
 * sur les 83 d'un seul passage (8,4 %).
 *
 * L'epreuve : les 18 lignes d'erreur ont ete supprimees, remettant les offres
 * dans la file telles quelles — pas un octet de leur texte n'a change. Les
 * DIX-HUIT ont ete jugees sans erreur au premier essai. Un echec qui ne se
 * reproduit pas sur une entree identique n'est pas attribuable a cette
 * entree ; c'est un alea, donc rejouable.
 *
 * Le refus reste la seule exception, et il ne se reconnait PAS au statut —
 * refus et troncature portent tous deux 200. Il se lit sur le drapeau
 * `permanent`, pose par `callClaudeStructured` sur `stop_reason === 'refusal'`
 * et sur rien d'autre. Un refus est deterministe par nature : le rejouer ne
 * ferait que repayer sans jamais converger.
 *
 * Le repli par defaut est donc « rejouable », qui est le cote sur : au pire
 * l'offre revient et coute un appel de plus ; les fusibles de `run-backfill`
 * arretent de toute facon une boucle qui n'avance pas. Le cout d'une erreur
 * dans l'autre sens vient d'etre mesure, et il se compte en offres perdues.
 */
export function isRetryableFailure(cause: unknown): boolean {
  if (!(cause instanceof ClaudeApiError)) return true;
  // Teste AVANT les statuts : un refus porte 200, que la ligne suivante
  // rendrait rejouable.
  if (cause.permanent) return false;
  if (cause.status === 429) return true;
  if (cause.status >= 500) return true;
  if (cause.status === 0) return true;
  if (cause.status === 200) return true;
  return false;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

/**
 * Peuple UNIQUEMENT quand `stop_reason` vaut `refusal` — `null` pour tout le
 * reste (`end_turn`, `max_tokens`, `tool_use`...). D'ou les champs optionnels
 * et la lecture defensive de `describeStop` : lire `.category` sans garde
 * planterait sur la reponse la plus banale.
 */
interface AnthropicStopDetails {
  type?: string;
  category?: string | null;
  explanation?: string;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  stop_details?: AnthropicStopDetails | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/**
 * Le suffixe de diagnostic accroche a TOUT echec survenu sur un HTTP 200.
 *
 * Mesure du 2026-09-10 (P31 dans ETAT.md) : 19 offres perdues en deux jours
 * sur des reponses 200 illisibles, et rien pour dire pourquoi — le message
 * d'erreur ne retenait que l'exception de `JSON.parse`. La cause reelle,
 * `stop_reason`, etait calculee par l'API, recue dans le corps, puis jetee.
 * Une ligne d'erreur qui ne porte pas de quoi diagnostiquer condamne l'offre
 * ET la question.
 *
 * `(absent)` plutot que rien quand le champ manque : une chaine vide se
 * confondrait avec « je n'ai pas regarde ».
 */
function describeStop(payload: AnthropicResponse): string {
  const parts = [`stop_reason=${payload.stop_reason ?? '(absent)'}`];
  const details = payload.stop_details;
  if (details) {
    if (details.category) parts.push(`categorie=${details.category}`);
    if (details.explanation) parts.push(`explication=${details.explanation}`);
  }
  return ` [${parts.join(', ')}]`;
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

  // Le refus se teste AVANT de chercher un bloc de texte, pour la meme raison
  // que `max_tokens` juste au-dessus : il se presente sous DEUX formes qui,
  // sans ce test, se deguisent en autre chose.
  //
  //   * refus avant toute sortie  -> `content` vide  -> « sans bloc de texte »
  //   * refus en cours de sortie  -> texte partiel   -> « JSON illisible »
  //
  // Ce sont exactement les deux familles d'erreur mesurees le 2026-09-10
  // (4 cas et 13 cas). Les nommer pour ce qu'elles sont evite de rejouer le
  // diagnostic de P16 — un plafond de sortie trop bas — sur une cause qui n'a
  // rien a voir.
  if (payload.stop_reason === 'refusal') {
    throw new ClaudeApiError(`refus du modele${describeStop(payload)}`, response.status, true);
  }

  const textBlock = payload.content?.find((block) => block.type === 'text');
  if (textBlock === undefined) {
    throw new ClaudeApiError(
      `reponse Claude sans bloc de texte${describeStop(payload)}`,
      response.status,
    );
  }
  const text = textBlock.text;
  if (!text) {
    throw new ClaudeApiError(
      `reponse Claude avec un bloc de texte vide${describeStop(payload)}`,
      response.status,
    );
  }

  let value: T;
  try {
    value = JSON.parse(text) as T;
  } catch (cause) {
    throw new ClaudeApiError(
      `sortie structuree illisible : ${String(cause)}${describeStop(payload)}`,
      response.status,
    );
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
