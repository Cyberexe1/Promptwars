import {
  CreateTableCommand,
  DeleteTableCommand,
  DynamoDBClient,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EventRecord, UserRecord } from '../../src/domain/models.js';
import {
  DynamoEventRepository,
  DynamoUserRepository,
} from '../../src/repositories/dynamodb.js';
import { VersionConflictError } from '../../src/repositories/repository.js';
import { generatePlan } from '../../src/services/planning/generate-plan.js';

const runIntegration = process.env.RUN_DYNAMODB_INTEGRATION === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;
const endpoint = process.env.DDB_ENDPOINT ?? 'http://localhost:8000';
const tableName = `eventplanner-test-${Date.now()}`;
const client = new DynamoDBClient({
  region: 'us-east-1',
  endpoint,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});
const documentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

describeIntegration('DynamoDB Local repository integration', () => {
  beforeAll(async () => {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
      }),
    );
    await waitUntilTableExists(
      { client, maxWaitTime: 30 },
      { TableName: tableName },
    );
  }, 30_000);

  afterAll(async () => {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
    client.destroy();
  });

  it('round-trips accounts with atomic email uniqueness', async () => {
    const users = new DynamoUserRepository(documentClient, tableName);
    const user: UserRecord = {
      id: 'user-1',
      email: 'planner@example.com',
      passwordHash: 'private-hash',
      createdAt: '2026-10-26T00:00:00.000Z',
    };

    await expect(users.create(user)).resolves.toBe(true);
    await expect(users.findByEmail(user.email)).resolves.toEqual(user);
    await expect(users.create({ ...user, id: 'user-2' })).resolves.toBe(false);
    await expect(users.findByEmail('missing@example.com')).resolves.toBeNull();
  });

  it('round-trips, mutates, replaces, protects, and deletes a complete plan', async () => {
    const events = new DynamoEventRepository(documentClient, tableName);
    const event: EventRecord = {
      id: 'event-1',
      userId: 'user-1',
      version: 1,
      type: 'birthday',
      title: 'Community birthday',
      date: '2099-08-20',
      guestCount: 40,
      totalBudget: 2_500,
      currency: 'USD',
      city: 'Austin',
      indoorOutdoor: 'outdoor',
      preferences: ['eco-friendly'],
      audience: 'kids',
      createdAt: '2026-10-26T00:00:00.000Z',
      updatedAt: '2026-10-26T00:00:00.000Z',
    };
    const plan = generatePlan(event, new Date('2026-10-26T00:00:00.000Z'));

    await events.savePlan(plan);
    await expect(events.getPlan('other-user', event.id)).resolves.toBeNull();
    const stored = await events.getPlan(event.userId, event.id);
    expect(stored).toEqual(plan);
    await expect(events.listByUser(event.userId)).resolves.toEqual([event]);

    const task = stored!.tasks[0]!;
    await expect(
      events.updateTask(event.userId, event.id, task.id, 'completed', 1),
    ).resolves.toMatchObject({ status: 'completed' });

    const afterTask = await events.getPlan(event.userId, event.id);
    expect(afterTask?.event.version).toBe(2);
    const budget = afterTask!.budget[0]!;
    await expect(
      events.updateBudget(event.userId, event.id, budget.category, 100, 2),
    ).resolves.toMatchObject({ spent: 100 });

    const afterBudget = await events.getPlan(event.userId, event.id);
    expect(afterBudget?.event.version).toBe(3);
    const vendor = afterBudget!.vendors[0]!;
    await expect(
      events.updateVendor(
        event.userId,
        event.id,
        vendor.id,
        { status: 'quoted', quote: 250 },
        3,
      ),
    ).resolves.toMatchObject({ status: 'quoted', quote: 250 });

    await expect(
      events.savePlan({ ...plan, event: { ...event, version: 2 } }, 1),
    ).rejects.toBeInstanceOf(VersionConflictError);

    const current = (await events.getPlan(event.userId, event.id))!;
    const removedVendorId = current.vendors.at(-1)!.id;
    const replacement = {
      ...current,
      event: { ...current.event, version: 5 },
      vendors: current.vendors.slice(0, -1),
    };
    await events.savePlan(replacement, 4);
    expect(
      (await events.getPlan(event.userId, event.id))?.vendors.some(
        (item) => item.id === removedVendorId,
      ),
    ).toBe(false);

    await expect(
      events.deletePlan(event.userId, event.id, 4),
    ).rejects.toBeInstanceOf(VersionConflictError);
    await expect(events.deletePlan(event.userId, event.id, 5)).resolves.toBe(
      true,
    );
    await expect(events.getPlan(event.userId, event.id)).resolves.toBeNull();
  });
});
