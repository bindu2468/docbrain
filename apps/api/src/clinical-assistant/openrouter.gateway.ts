import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';
const REQUEST_TIMEOUT_MS = 60_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  maxTokens: number;
}

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  error?: { message?: string; code?: number | string };
}

/**
 * The only place the API talks to a language model, through OpenRouter's
 * OpenAI-compatible chat completions endpoint.
 *
 * Optional like the patient brain: with no `OPENROUTER_API_KEY` the
 * assistant reports itself disabled, and every rule-based screen keeps working.
 */
@Injectable()
export class OpenRouterGateway {
  private readonly logger = new Logger(OpenRouterGateway.name);
  private readonly apiKey: string | null;
  readonly model: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('OPENROUTER_API_KEY') || null;
    this.model = configService.get<string>('OPENROUTER_MODEL') || DEFAULT_MODEL;
  }

  get isEnabled(): boolean {
    return this.apiKey !== null;
  }

  async chat({ messages, maxTokens }: ChatOptions): Promise<string> {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'The clinical assistant is not configured. Set OPENROUTER_API_KEY in apps/api/.env.',
      );
    }

    let response: Response;
    try {
      response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // Optional attribution headers OpenRouter shows in its dashboard
          'X-Title': 'Patient Brain',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: maxTokens,
          // Current Claude models reason before answering and it cannot be
          // switched off; the reasoning shares max_tokens. Low effort keeps
          // budget for the answer, and `exclude` drops the reasoning text we
          // would discard anyway.
          reasoning: { effort: 'low', exclude: true },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        'OpenRouter request failed',
        error instanceof Error ? error.message : error,
      );
      throw new ServiceUnavailableException('The clinical assistant did not respond. Try again.');
    }

    const body = (await response.json().catch(() => null)) as ChatCompletionBody | null;

    if (!response.ok || body?.error) {
      // OpenRouter's message names the cause (bad model id, no credits) and
      // never echoes the key
      this.logger.error(
        `OpenRouter ${response.status} for ${this.model}: ${body?.error?.message ?? 'no message'}`,
      );
      throw new ServiceUnavailableException('The clinical assistant could not answer. Try again.');
    }

    const choice = body?.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (!content) {
      // "length" here means reasoning used the whole budget before the answer
      this.logger.warn(
        `Empty reply from ${this.model} (finish_reason=${choice?.finish_reason ?? 'none'})`,
      );
      throw new ServiceUnavailableException('The clinical assistant returned an empty answer.');
    }
    return content;
  }
}
