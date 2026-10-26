import {
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/config/logger.js';
import {
  AiModelUnavailableError,
  BedrockAiModelClient,
  type BedrockAiModelClientOptions,
} from '../../src/services/ai/bedrock-client.js';

const request = {
  system: 'Return JSON only.',
  prompt: 'Synthetic event prompt.',
  temperature: 4,
  maxTokens: 99_999,
};

function sender(send: ReturnType<typeof vi.fn>) {
  return { send } as unknown as NonNullable<
    BedrockAiModelClientOptions['client']
  >;
}

function output(
  stopReason: ConverseCommandOutput['stopReason'],
  content: NonNullable<
    NonNullable<ConverseCommandOutput['output']>['message']
  >['content'],
): ConverseCommandOutput {
  return {
    $metadata: { requestId: 'request-1' },
    stopReason,
    output: { message: { role: 'assistant', content } },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('BedrockAiModelClient', () => {
  it('builds a bounded Converse request with optional Guardrail settings', async () => {
    const send = vi
      .fn()
      .mockResolvedValue(output('end_turn', [{ text: '{"reply":"Ready"}' }]));
    const client = new BedrockAiModelClient({
      modelId: 'model-1',
      guardrailId: 'guardrail-1',
      guardrailVersion: '1',
      client: sender(send),
    });

    await expect(client.generate(request)).resolves.toBe('{"reply":"Ready"}');
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(ConverseCommand);
    expect((command as ConverseCommand).input).toMatchObject({
      modelId: 'model-1',
      inferenceConfig: { temperature: 1, maxTokens: 2_048 },
      guardrailConfig: {
        guardrailIdentifier: 'guardrail-1',
        guardrailVersion: '1',
        trace: 'disabled',
      },
    });
    expect(send.mock.calls[0]?.[1]?.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ['max_tokens', [{ text: '{"reply":"truncated"}' }]],
    ['guardrail_intervened', [{ text: '{"reply":"blocked"}' }]],
    ['content_filtered', [{ text: '{"reply":"blocked"}' }]],
    [
      'end_turn',
      [
        {
          toolUse: {
            toolUseId: 'tool-1',
            name: 'unexpected',
            input: {},
          },
        },
      ],
    ],
  ] as const)(
    'rejects unsafe or non-text output: %s',
    async (reason, content) => {
      vi.spyOn(logger, 'warn').mockImplementation(() => logger);
      const send = vi
        .fn()
        .mockResolvedValue(
          output(
            reason as ConverseCommandOutput['stopReason'],
            content as NonNullable<
              NonNullable<ConverseCommandOutput['output']>['message']
            >['content'],
          ),
        );
      const client = new BedrockAiModelClient({
        modelId: 'model-1',
        client: sender(send),
      });

      await expect(client.generate(request)).rejects.toBeInstanceOf(
        AiModelUnavailableError,
      );
    },
  );

  it('aborts at the caller-provided remaining deadline', async () => {
    vi.useFakeTimers();
    vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const send = vi.fn().mockImplementation(
      (
        _command: unknown,
        options: { abortSignal: AbortSignal },
      ): Promise<ConverseCommandOutput> =>
        new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener('abort', () => {
            reject(new Error('transport aborted'));
          });
        }),
    );
    const client = new BedrockAiModelClient({
      modelId: 'model-1',
      client: sender(send),
    });

    const result = expect(
      client.generate({ ...request, timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(AiModelUnavailableError);
    await vi.advanceTimersByTimeAsync(11);
    await result;
  });

  it('does not send prompts, output, or error messages to warning logs', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const send = vi
      .fn()
      .mockRejectedValue(new Error('SECRET transport detail'));
    const client = new BedrockAiModelClient({
      modelId: 'model-1',
      client: sender(send),
    });

    await expect(client.generate(request)).rejects.toBeInstanceOf(
      AiModelUnavailableError,
    );
    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).not.toContain('SECRET');
    expect(logged).not.toContain(request.system);
    expect(logged).not.toContain(request.prompt);
  });

  it('fails before transport when no model is configured', async () => {
    const send = vi.fn();
    const client = new BedrockAiModelClient({ client: sender(send) });

    await expect(client.generate(request)).rejects.toBeInstanceOf(
      AiModelUnavailableError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
