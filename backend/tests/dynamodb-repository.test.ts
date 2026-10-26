import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { describe, expect, it, vi } from 'vitest';
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

function mockClient() {
  const send = vi.fn();
  return {
    send,
    client: { send } as unknown as DynamoDBDocumentClient,
  };
}

function transactionCancellation(codes: string[]) {
  return new TransactionCanceledException({
    $metadata: {},
    message: 'Transaction cancelled',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

const event = (id: string): EventRecord => ({
  id,
  userId: 'user-1',
  version: 1,
  type: 'birthday',
  title: id,
  date: '2099-08-20',
  guestCount: 20,
  totalBudget: 1_000,
  currency: 'USD',
  city: 'Austin',
  indoorOutdoor: 'indoor',
  preferences: [],
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
});

const emptyPlan = (record: EventRecord): EventPlan => ({
  event: record,
  budget: [],
  tasks: [],
  vendors: [],
  warnings: [],
});

describe('DynamoDB repositories', () => {
  it('paginates event queries and requests strongly consistent pages', async () => {
    const { client, send } = mockClient();
    send
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'EVENT#one',
            entityType: 'EVENT',
            data: event('one'),
          },
        ],
        LastEvaluatedKey: { PK: 'USER#user-1', SK: 'EVENT#one' },
      })
      .mockResolvedValueOnce({
        Items: [
          {
            PK: 'USER#user-1',
            SK: 'EVENT#two',
            entityType: 'EVENT',
            data: event('two'),
          },
        ],
      });
    const repository = new DynamoEventRepository(client, 'events');

    await expect(repository.listByUser('user-1')).resolves.toHaveLength(2);
    expect(send).toHaveBeenCalledTimes(2);
    for (const [command] of send.mock.calls as [
      [QueryCommand],
      [QueryCommand],
    ]) {
      expect(command).toBeInstanceOf(QueryCommand);
      expect(command.input.ConsistentRead).toBe(true);
    }
    expect(
      (send.mock.calls[1]?.[0] as QueryCommand).input.ExclusiveStartKey,
    ).toEqual({ PK: 'USER#user-1', SK: 'EVENT#one' });
  });

  it('maps only the email uniqueness cancellation to a duplicate account', async () => {
    const user: UserRecord = {
      id: 'user-1',
      email: 'planner@example.com',
      passwordHash: 'hash',
      createdAt: '2026-10-26T00:00:00.000Z',
    };
    const duplicate = mockClient();
    duplicate.send.mockRejectedValueOnce(
      transactionCancellation(['ConditionalCheckFailed', 'None']),
    );
    await expect(
      new DynamoUserRepository(duplicate.client, 'events').create(user),
    ).resolves.toBe(false);

    const operationalFailure = mockClient();
    const cancellation = transactionCancellation([
      'TransactionConflict',
      'None',
    ]);
    operationalFailure.send.mockRejectedValueOnce(cancellation);
    await expect(
      new DynamoUserRepository(operationalFailure.client, 'events').create(
        user,
      ),
    ).rejects.toBe(cancellation);
  });

  it('adds an optimistic version condition when replacing a plan', async () => {
    const { client, send } = mockClient();
    send.mockResolvedValueOnce({ Items: [] }).mockResolvedValueOnce({});
    const repository = new DynamoEventRepository(client, 'events');
    const nextEvent = { ...event('one'), version: 2 };

    await repository.savePlan(emptyPlan(nextEvent), 1);

    const transaction = send.mock.calls[1]?.[0] as TransactWriteCommand;
    expect(transaction).toBeInstanceOf(TransactWriteCommand);
    expect(transaction.input.TransactItems?.[0]?.Put).toMatchObject({
      ConditionExpression: '#data.#version = :expectedVersion',
      ExpressionAttributeValues: { ':expectedVersion': 1 },
    });
  });

  it('surfaces an owner version race as a conflict', async () => {
    const { client, send } = mockClient();
    send.mockRejectedValueOnce(
      transactionCancellation(['ConditionalCheckFailed', 'None']),
    );
    const repository = new DynamoEventRepository(client, 'events');

    await expect(
      repository.updateTask('user-1', 'event-1', 'task-1', 'completed', 3),
    ).rejects.toBeInstanceOf(VersionConflictError);
  });
});
