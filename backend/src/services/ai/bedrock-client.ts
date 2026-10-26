import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { logger } from '../../config/logger.js';
import type { AiGenerateRequest, AiModelClient } from './model-client.js';

const TIMEOUT_MS = 25_000;
const MAX_TOKENS = 2_048;

export class AiModelUnavailableError extends Error {
  constructor() {
    super('AI model is unavailable');
    this.name = 'AiModelUnavailableError';
  }
}

type BedrockSender = Pick<BedrockRuntimeClient, 'send'>;

export interface BedrockAiModelClientOptions {
  modelId?: string;
  region?: string;
  guardrailId?: string;
  guardrailVersion?: string;
  client?: BedrockSender;
}

function errorClass(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function requestIdFrom(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = Reflect.get(value, '$metadata');
  if (!metadata || typeof metadata !== 'object') return undefined;
  const requestId = Reflect.get(metadata, 'requestId');
  return typeof requestId === 'string' ? requestId : undefined;
}

function extractText(output: ConverseCommandOutput): string {
  if (
    output.stopReason !== 'end_turn' &&
    output.stopReason !== 'stop_sequence'
  ) {
    throw new Error('UnsafeModelStopReason');
  }
  const content = output.output?.message?.content;
  if (!content?.length || content.some((block) => !('text' in block))) {
    throw new Error('NonTextModelResponse');
  }
  const text = content
    .map((block) => ('text' in block ? block.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error('EmptyModelResponse');
  return text;
}

export class BedrockAiModelClient implements AiModelClient {
  private readonly modelId?: string;
  private readonly guardrailId?: string;
  private readonly guardrailVersion?: string;
  private readonly client: BedrockSender;

  constructor(options: BedrockAiModelClientOptions = {}) {
    this.modelId = options.modelId?.trim() || undefined;
    this.guardrailId = options.guardrailId?.trim() || undefined;
    this.guardrailVersion = options.guardrailVersion?.trim() || undefined;
    this.client =
      options.client ??
      new BedrockRuntimeClient({
        ...(options.region ? { region: options.region } : {}),
        maxAttempts: 2,
      });
  }

  async generate(request: AiGenerateRequest): Promise<string> {
    if (!this.modelId) throw new AiModelUnavailableError();

    const controller = new AbortController();
    const timeoutMs = Math.min(
      TIMEOUT_MS,
      Math.max(1, Math.trunc(request.timeoutMs ?? TIMEOUT_MS)),
    );
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();
    try {
      const output = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: request.system }],
          messages: [{ role: 'user', content: [{ text: request.prompt }] }],
          inferenceConfig: {
            temperature: Math.min(1, Math.max(0, request.temperature)),
            maxTokens: Math.min(
              MAX_TOKENS,
              Math.max(1, Math.trunc(request.maxTokens)),
            ),
          },
          ...(this.guardrailId && this.guardrailVersion
            ? {
                guardrailConfig: {
                  guardrailIdentifier: this.guardrailId,
                  guardrailVersion: this.guardrailVersion,
                  trace: 'disabled',
                },
              }
            : {}),
        }),
        { abortSignal: controller.signal },
      );
      const text = extractText(output);
      logger.info(
        {
          operation: 'bedrock.converse',
          durationMs: Date.now() - startedAt,
          requestId: output.$metadata.requestId,
        },
        'AI model request completed',
      );
      return text;
    } catch (error) {
      logger.warn(
        {
          operation: 'bedrock.converse',
          durationMs: Date.now() - startedAt,
          errorClass: errorClass(error),
          requestId: requestIdFrom(error),
        },
        'AI model request failed',
      );
      throw new AiModelUnavailableError();
    } finally {
      clearTimeout(timeout);
    }
  }
}
