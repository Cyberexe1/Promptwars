import type {
  ConverseCommand,
  ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it, vi } from 'vitest';
import type { EventContext, EventPlan } from '../src/domain/models.js';
import {
  InMemoryEventRepository,
  InMemoryUserRepository,
} from '../src/repositories/in-memory.js';
import { VersionConflictError } from '../src/repositories/repository.js';
import {
  AiModelUnavailableError,
  BedrockAiModelClient,
} from '../src/services/ai/bedrock-client.js';
import { generateBudget } from '../src/services/planning/budget.js';
import { generateTimeline } from '../src/services/planning/timeline.js';
import { generatePlan } from '../src/services/planning/generate-plan.js';

const context: EventContext = {
  type: 'birthday',
  title: 'Party',
  date: '2027-03-20',
  guestCount: 30,
  totalBudget: 3_000,
  currency: 'USD',
  city: 'Austin',
  indoorOutdoor: 'indoor',
  preferences: [],
};
const today = new Date('2026-10-26T00:00:00.000Z');

describe('planning validation', () => {
  it('rejects budgets that are not positive, finite, whole-cent amounts', () => {
    expect(() => generateBudget({ ...context, totalBudget: 0 })).toThrow(
      'positive',
    );
    expect(() => generateBudget({ ...context, totalBudget: -5 })).toThrow(
      'positive',
    );
    expect(() =>
      generateBudget({ ...context, totalBudget: Number.NaN }),
    ).toThrow('positive');
    expect(() =>
      generateBudget({ ...context, totalBudget: Number.POSITIVE_INFINITY }),
    ).toThrow();
    expect(() => generateBudget({ ...context, totalBudget: 10.001 })).toThrow(
      'cents',
    );
  });

  it('rejects malformed, impossible, and past event dates', () => {
    expect(() =>
      generateTimeline({ ...context, date: '20-03-2027' }, today),
    ).toThrow('YYYY-MM-DD');
    expect(() =>
      generateTimeline({ ...context, date: '2027-02-30' }, today),
    ).toThrow('valid calendar');
    expect(() =>
      generateTimeline({ ...context, date: '2020-01-01' }, today),
    ).toThrow('past');
    expect(() => generateTimeline(context, new Date('invalid'))).toThrow(
      'valid date',
    );
  });

  it('warns about short notice and overdue tasks, with correct singular wording', () => {
    const tomorrow = generateTimeline(
      { ...context, date: '2026-10-27' },
      today,
    );
    expect(
      tomorrow.warnings.some((warning) => warning.includes('1 day away')),
    ).toBe(true);
    expect(
      tomorrow.warnings.some((warning) =>
        warning.includes('past the recommended due date'),
      ),
    ).toBe(true);

    const nextWeek = generateTimeline(
      { ...context, date: '2026-11-02' },
      today,
    );
    expect(
      nextWeek.warnings.some((warning) => warning.includes('7 days away')),
    ).toBe(true);
    expect(
      nextWeek.tasks.some((task) => task.overdue && task.phase === 'Now'),
    ).toBe(true);
  });

  it('adjusts allocations for large parties and for children', () => {
    const large = generateBudget({ ...context, guestCount: 300 });
    expect(
      large.budget.some((item) =>
        item.notes.some((note) => note.includes('high guest count')),
      ),
    ).toBe(true);

    const kids = generateBudget({ ...context, audience: 'kids' });
    expect(kids.budget.some((item) => item.category === 'entertainment')).toBe(
      true,
    );
  });

  it('builds a complete plan for every event type', () => {
    for (const type of ['wedding', 'birthday', 'community'] as const) {
      const plan = generatePlan(
        {
          ...context,
          type,
          id: 'e',
          userId: 'u',
          version: 1,
          createdAt: '',
          updatedAt: '',
        } as never,
        today,
      );
      expect(plan.budget.length).toBeGreaterThan(0);
      expect(plan.tasks.length).toBeGreaterThan(0);
      const allocated = plan.budget.reduce(
        (sum, item) => sum + Math.round(item.allocated * 100),
        0,
      );
      expect(allocated).toBe(300_000);
    }
  });
});

describe('in-memory repositories', () => {
  const plan = (): EventPlan => {
    const event = {
      ...context,
      id: 'e1',
      userId: 'u1',
      version: 1,
      createdAt: '',
      updatedAt: '',
    };
    return generatePlan(event as never, today);
  };

  it('returns false/null for unknown records and clones what it stores', async () => {
    const users = new InMemoryUserRepository();
    expect(await users.findByEmail('none@example.com')).toBeNull();

    const events = new InMemoryEventRepository();
    const original = plan();
    await events.savePlan(original);
    original.event.title = 'mutated after save';
    expect((await events.getPlan('u1', 'e1'))?.event.title).toBe('Party');

    expect(await events.getPlan('u1', 'other')).toBeNull();
    expect(await events.deletePlan('u1', 'other', 1)).toBe(false);
    expect(
      await events.updateTask('u1', 'other', 't', 'completed', 1),
    ).toBeNull();
    expect(await events.updateBudget('u1', 'other', 'venue', 1, 1)).toBeNull();
    expect(
      await events.updateVendor('u1', 'other', 'v', { status: 'booked' }, 1),
    ).toBeNull();
  });

  it('returns null for unknown children and conflicts for stale versions', async () => {
    const events = new InMemoryEventRepository();
    await events.savePlan(plan());

    expect(
      await events.updateTask('u1', 'e1', 'missing', 'completed', 1),
    ).toBeNull();
    expect(await events.updateBudget('u1', 'e1', 'missing', 1, 1)).toBeNull();
    expect(
      await events.updateVendor('u1', 'e1', 'missing', { status: 'booked' }, 1),
    ).toBeNull();
    await expect(
      events.updateTask('u1', 'e1', 'x', 'completed', 9),
    ).rejects.toBeInstanceOf(VersionConflictError);
    await expect(events.deletePlan('u1', 'e1', 9)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    await expect(events.savePlan(plan())).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    await expect(events.savePlan(plan(), 9)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });

  it('applies vendor changes with and without a quote', async () => {
    const events = new InMemoryEventRepository();
    const created = plan();
    await events.savePlan(created);
    const vendorId = created.vendors[0]!.id;

    const quoted = await events.updateVendor(
      'u1',
      'e1',
      vendorId,
      { status: 'quoted', quote: 10 },
      1,
    );
    expect(quoted).toMatchObject({ status: 'quoted', quote: 10 });
    const booked = await events.updateVendor(
      'u1',
      'e1',
      vendorId,
      { status: 'booked' },
      2,
    );
    expect(booked).toMatchObject({ status: 'booked', quote: 10 });
  });
});

describe('Bedrock client', () => {
  const output = (
    overrides: Partial<ConverseCommandOutput>,
  ): ConverseCommandOutput =>
    ({
      $metadata: { requestId: 'req-1' },
      stopReason: 'end_turn',
      output: {
        message: { role: 'assistant', content: [{ text: ' hello ' }] },
      },
      ...overrides,
    }) as ConverseCommandOutput;
  const request = {
    system: 's',
    prompt: 'p',
    temperature: 0.5,
    maxTokens: 100,
  };

  it('is unavailable without a model id, and never calls AWS', async () => {
    const send = vi.fn();
    const client = new BedrockAiModelClient({
      modelId: '  ',
      client: { send },
    });
    await expect(client.generate(request)).rejects.toBeInstanceOf(
      AiModelUnavailableError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('clamps inference settings and includes guardrails only when fully configured', async () => {
    const send = vi.fn().mockResolvedValue(output({}));
    const guarded = new BedrockAiModelClient({
      modelId: 'model',
      guardrailId: 'gr',
      guardrailVersion: '1',
      client: { send },
    });
    await expect(
      guarded.generate({
        ...request,
        temperature: 9,
        maxTokens: 99_999,
        timeoutMs: 5,
      }),
    ).resolves.toBe('hello');
    const command = send.mock.calls[0]![0] as ConverseCommand;
    expect(command.input.inferenceConfig).toEqual({
      temperature: 1,
      maxTokens: 2_048,
    });
    expect(command.input.guardrailConfig).toMatchObject({
      guardrailIdentifier: 'gr',
    });

    send.mockClear();
    const half = new BedrockAiModelClient({
      modelId: 'model',
      guardrailId: 'gr',
      client: { send },
    });
    await half.generate({ ...request, temperature: -3, maxTokens: 0 });
    const plain = send.mock.calls[0]![0] as ConverseCommand;
    expect(plain.input.guardrailConfig).toBeUndefined();
    expect(plain.input.inferenceConfig).toEqual({
      temperature: 0,
      maxTokens: 1,
    });
  });

  it.each([
    ['an unsafe stop reason', output({ stopReason: 'max_tokens' })],
    [
      'a non-text block',
      output({
        output: {
          message: { role: 'assistant', content: [{ image: {} }] },
        } as never,
      }),
    ],
    [
      'empty content',
      output({
        output: { message: { role: 'assistant', content: [] } } as never,
      }),
    ],
    [
      'blank text',
      output({
        output: {
          message: { role: 'assistant', content: [{ text: '   ' }] },
        } as never,
      }),
    ],
    ['a missing message', output({ output: undefined })],
  ])(
    'hides %s behind a generic unavailable error',
    async (_label, response) => {
      const client = new BedrockAiModelClient({
        modelId: 'model',
        client: { send: async () => response },
      });
      await expect(client.generate(request)).rejects.toBeInstanceOf(
        AiModelUnavailableError,
      );
    },
  );

  it('hides transport failures, including non-Error rejections', async () => {
    for (const failure of [
      Object.assign(new Error('boom'), { $metadata: { requestId: 'r' } }),
      'a string',
      null,
    ]) {
      const client = new BedrockAiModelClient({
        modelId: 'model',
        client: { send: async () => Promise.reject(failure) },
      });
      await expect(client.generate(request)).rejects.toBeInstanceOf(
        AiModelUnavailableError,
      );
    }
  });
});
