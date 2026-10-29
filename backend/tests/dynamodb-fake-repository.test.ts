import { describe, expect, it } from 'vitest';
import type {
  EventPlan,
  EventRecord,
  UserRecord,
} from '../src/domain/models.js';
import {
  DynamoEventRepository,
  DynamoUserRepository,
} from '../src/repositories/dynamodb.js';
import { VersionConflictError } from '../src/repositories/repository.js';
import { FakeDynamoClient } from './helpers/fake-dynamodb.js';

const record = (id: string, date = '2099-08-20', version = 1): EventRecord => ({
  id,
  userId: 'user-1',
  version,
  type: 'birthday',
  title: id,
  date,
  guestCount: 20,
  totalBudget: 1_000,
  currency: 'USD',
  city: 'Austin',
  indoorOutdoor: 'indoor',
  preferences: [],
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
});

const planFor = (
  event: EventRecord,
  extra: Partial<EventPlan> = {},
): EventPlan => ({
  event,
  budget: [
    { category: 'food', label: 'Food', allocated: 600, spent: 0, notes: [] },
    { category: 'venue', label: 'Venue', allocated: 400, spent: 0, notes: [] },
  ],
  tasks: [
    {
      id: 'task-1',
      title: 'Book venue',
      category: 'venue',
      dueDate: '2099-07-01',
      status: 'pending',
      priority: 1,
      phase: 'Now',
      urgent: false,
      overdue: false,
    },
  ],
  vendors: [
    {
      id: 'vendor-1',
      category: 'food',
      name: 'Caterer',
      whyNeeded: 'Meals',
      leadTimeDays: 30,
      suggestedBudget: 500,
      questions: ['Allergens?'],
      status: 'to-research',
    },
  ],
  warnings: ['Check headcount'],
  ...extra,
});

function setup() {
  const fake = new FakeDynamoClient();
  return {
    fake,
    users: new DynamoUserRepository(fake.client, 'table'),
    events: new DynamoEventRepository(fake.client, 'table'),
  };
}

describe('DynamoDB repositories against an in-memory client', () => {
  it('creates users once and finds them by email', async () => {
    const { users } = setup();
    const user: UserRecord = {
      id: 'user-1',
      email: 'planner@example.com',
      passwordHash: 'hash',
      createdAt: '2026-10-26T00:00:00.000Z',
    };

    await expect(users.create(user)).resolves.toBe(true);
    await expect(users.create({ ...user, id: 'user-2' })).resolves.toBe(false);
    await expect(users.findByEmail(user.email)).resolves.toEqual(user);
    await expect(users.findByEmail('missing@example.com')).resolves.toBeNull();
  });

  it('round-trips a plan in stored order and lists events by date', async () => {
    const { events } = setup();
    await events.savePlan(planFor(record('late', '2099-12-01')));
    await events.savePlan(planFor(record('early', '2099-01-01')));

    const loaded = await events.getPlan('user-1', 'early');
    expect(loaded?.budget.map((item) => item.category)).toEqual([
      'food',
      'venue',
    ]);
    expect(loaded?.tasks).toHaveLength(1);
    expect(loaded?.vendors[0]?.name).toBe('Caterer');
    expect(loaded?.warnings).toEqual(['Check headcount']);
    expect(
      (await events.listByUser('user-1')).map((event) => event.id),
    ).toEqual(['early', 'late']);
    await expect(events.getPlan('user-1', 'nope')).resolves.toBeNull();
    await expect(events.getPlan('other-user', 'early')).resolves.toBeNull();
  });

  it('pages through large partitions', async () => {
    const { events, fake } = setup();
    fake.pageSize = 1;
    await events.savePlan(planFor(record('paged')));

    const loaded = await events.getPlan('user-1', 'paged');
    expect(loaded?.budget).toHaveLength(2);
    expect(loaded?.tasks).toHaveLength(1);
  });

  it('replaces a plan atomically, removing stale children', async () => {
    const { events } = setup();
    await events.savePlan(planFor(record('one')));
    const next = planFor(record('one', '2099-08-20', 2), {
      tasks: [],
      vendors: [],
    });

    await events.savePlan(next, 1);

    const loaded = await events.getPlan('user-1', 'one');
    expect(loaded?.event.version).toBe(2);
    expect(loaded?.tasks).toEqual([]);
    expect(loaded?.vendors).toEqual([]);
  });

  it('rejects stale replacements and duplicate creations as conflicts', async () => {
    const { events } = setup();
    await events.savePlan(planFor(record('one')));

    await expect(
      events.savePlan(planFor(record('one', '2099-08-20', 2)), 7),
    ).rejects.toBeInstanceOf(VersionConflictError);
    await expect(
      events.savePlan(planFor(record('one'))),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('refuses plans that exceed the transaction limit', async () => {
    const { events } = setup();
    const tasks = Array.from({ length: 101 }, (_, index) => ({
      ...planFor(record('big')).tasks[0]!,
      id: `task-${index}`,
    }));

    await expect(
      events.savePlan(planFor(record('big'), { tasks })),
    ).rejects.toThrow('transaction limit');
  });

  it('updates tasks, budget, and vendors and bumps the version', async () => {
    const { events } = setup();
    await events.savePlan(planFor(record('one')));

    expect(
      (await events.updateTask('user-1', 'one', 'task-1', 'completed', 1))
        ?.status,
    ).toBe('completed');
    expect(
      (await events.updateBudget('user-1', 'one', 'food', 250, 2))?.spent,
    ).toBe(250);
    const withQuote = await events.updateVendor(
      'user-1',
      'one',
      'vendor-1',
      { status: 'quoted', quote: 480 },
      3,
    );
    expect(withQuote).toMatchObject({ status: 'quoted', quote: 480 });
    const withoutQuote = await events.updateVendor(
      'user-1',
      'one',
      'vendor-1',
      { status: 'booked' },
      4,
    );
    expect(withoutQuote).toMatchObject({ status: 'booked', quote: 480 });
    expect((await events.getPlan('user-1', 'one'))?.event.version).toBe(5);
  });

  it('returns null for unknown children and conflicts for stale versions', async () => {
    const { events } = setup();
    await events.savePlan(planFor(record('one')));

    await expect(
      events.updateTask('user-1', 'one', 'missing', 'completed', 1),
    ).resolves.toBeNull();
    await expect(
      events.updateTask('user-1', 'one', 'task-1', 'completed', 9),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });

  it('rethrows unexpected transaction failures', async () => {
    const { events, fake } = setup();
    await events.savePlan(planFor(record('one')));
    fake.failNextTransaction = new Error('throttled');

    await expect(
      events.updateTask('user-1', 'one', 'task-1', 'completed', 1),
    ).rejects.toThrow('throttled');
    fake.failNextTransaction = new Error('boom');
    await expect(events.savePlan(planFor(record('two')))).rejects.toThrow(
      'boom',
    );
    fake.failNextTransaction = new Error('delete-fail');
    await expect(events.deletePlan('user-1', 'one', 1)).rejects.toThrow(
      'delete-fail',
    );
  });

  it('deletes a plan with all children, guarding ownership and version', async () => {
    const { events, fake } = setup();
    await events.savePlan(planFor(record('one')));

    await expect(events.deletePlan('user-1', 'missing', 1)).resolves.toBe(
      false,
    );
    await expect(events.deletePlan('other-user', 'one', 1)).resolves.toBe(
      false,
    );
    await expect(events.deletePlan('user-1', 'one', 5)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
    await expect(events.deletePlan('user-1', 'one', 1)).resolves.toBe(true);
    expect(fake.items.size).toBe(0);
  });

  it('refuses to delete partitions beyond the transaction limit', async () => {
    const { events, fake } = setup();
    await events.savePlan(planFor(record('one')));
    for (let index = 0; index < 100; index += 1) {
      fake.items.set(`EVENT#one|EXTRA#${index}`, {
        PK: 'EVENT#one',
        SK: `EXTRA#${index}`,
        entityType: 'EXTRA',
      });
    }

    await expect(events.deletePlan('user-1', 'one', 1)).rejects.toThrow(
      'transaction limit',
    );
  });

  it('maps a delete race to a version conflict', async () => {
    const { events, fake } = setup();
    await events.savePlan(planFor(record('one')));
    const original = fake.send.bind(fake);
    let seen = false;
    fake.send = async (command: unknown) => {
      // Bump the stored version after the repository has read it.
      if (
        !seen &&
        (command as { constructor: { name: string } }).constructor.name ===
          'QueryCommand'
      ) {
        seen = true;
        const owner = fake.items.get('USER#user-1|EVENT#one')!;
        (owner.data as EventRecord).version = 2;
      }
      return original(command);
    };

    await expect(events.deletePlan('user-1', 'one', 1)).rejects.toBeInstanceOf(
      VersionConflictError,
    );
  });
});
