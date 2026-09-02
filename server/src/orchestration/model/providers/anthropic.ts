// orchestration/model/providers/anthropic.ts — implémentation propriétaire.
//
// Usage prévu (V2) : raisonnement complexe et chaînes d'outils longues sur
// données NON sensibles — la politique de routage n'y enverra jamais de
// donnée de sensibilité client/sensitive, car l'API est opérée hors de l'UE.
//
// Implémentation volontairement minimale : fetch direct sur l'API Messages,
// sans SDK, pour que le code reste lisible et que la facture (jetons) reste
// visible dans la réponse.

import {
  ModelError,
  type ModelRequest,
  type ModelResponse,
  type ModelRouter,
} from '../model-router.js';

export interface AnthropicConfig {
  apiKey: string | null;
  apiUrl: string;
  model: string;
}

interface AnthropicBlock {
  type?: string;
  text?: string;
}

export class AnthropicRouter implements ModelRouter {
  readonly name = 'anthropic';
  readonly provider = 'Anthropic';
  readonly dataResidency = 'us' as const; // API officielle : hors UE

  constructor(private readonly config: AnthropicConfig) {}

  isConfigured(): boolean {
    return Boolean(this.config.apiKey);
  }

  async complete(request: ModelRequest): Promise<ModelResponse> {
    if (!this.isConfigured()) {
      throw new ModelError(
        'AnthropicRouter non configuré : renseignez ANTHROPIC_API_KEY (réservé aux données non sensibles).'
      );
    }

    const baseUrl = this.config.apiUrl.replace(/\/+$/, '');
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        system: request.system,
        max_tokens: request.maxOutputTokens ?? 2048,
        messages: request.messages,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ModelError(
        `Anthropic API a répondu ${response.status} : ${detail.slice(0, 300)}`
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    const content = ((data.content ?? []) as AnthropicBlock[])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');

    return {
      content,
      model: data.model ?? this.config.model,
      provider: 'anthropic',
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
      finishReason: data.stop_reason ?? 'end_turn',
    };
  }
}
