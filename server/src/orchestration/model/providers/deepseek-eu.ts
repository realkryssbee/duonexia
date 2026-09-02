// orchestration/model/providers/deepseek-eu.ts — implémentation "poids
// ouverts servis depuis l'Union européenne".
//
// Pourquoi cette implémentation existe (décision RGPD, cf. business plan) :
// l'API officielle DeepSeek est opérée depuis la Chine ; y faire transiter
// des données de dossiers d'huissiers, de fiches de paie ou de patients est
// incompatible avec les obligations du studio et rédhibitoire commercialement
// sur les verticaux huissiers / secrétariats sociaux. Les poids étant
// ouverts, le même modèle est servi en Europe par des fournisseurs
// d'inférence (API compatible OpenAI) — c'est LE routeur des données
// client/sensitive.
//
// Sûreté par construction : DEEPSEEK_EU_BASE_URL n'a AUCUNE valeur par
// défaut. Si l'URL n'est pas renseignée, le routeur n'est pas configuré et
// la politique de routage refuse les tâches sur données clients.

import {
  ModelError,
  type ModelRequest,
  type ModelResponse,
  type ModelRouter,
} from '../model-router.js';

export interface DeepSeekEuConfig {
  baseUrl: string | null; // ex. "https://<fournisseur-eu>/v1" (API OpenAI-compatible)
  apiKey: string | null;
  model: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChatCompletion = any;

export class DeepSeekEuRouter implements ModelRouter {
  readonly name = 'deepseek-eu';
  readonly provider = 'deepseek (inférence UE)';
  readonly dataResidency = 'eu' as const;

  constructor(private readonly config: DeepSeekEuConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.baseUrl && this.config.apiKey);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (!this.isConfigured()) {
      throw new ModelError(
        'DeepSeekEuRouter non configuré : renseignez DEEPSEEK_EU_BASE_URL (fournisseur d\'inférence européen) et DEEPSEEK_EU_API_KEY.'
      );
    }

    // Format OpenAI-compatible : le message système est le premier message.
    const messages = [
      { role: 'system', content: request.system },
      ...request.messages.map((message) => ({ role: message.role, content: message.content })),
    ];

    const baseUrl = (this.config.baseUrl ?? '').replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: request.maxOutputTokens ?? 4096,
        // La température n'est pas exposée par l'interface : le cadrage se
        // fait par le prompt système (décision : moins de réglages = moins
        // de comportements imprévisibles sur des données clients).
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ModelError(
        `Fournisseur d'inférence UE a répondu ${response.status} : ${detail.slice(0, 300)}`
      );
    }

    const data = (await response.json()) as ChatCompletion;
    const choice = data.choices?.[0];
    return {
      content: choice?.message?.content ?? '',
      model: data.model ?? this.config.model,
      provider: 'deepseek-eu',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      finishReason: choice?.finish_reason ?? 'stop',
    };
  }
}
