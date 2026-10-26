import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type {
  BudgetItem,
  EventPlan,
  EventRecord,
  PlanTask,
  UserRecord,
  VendorItem,
} from '../domain/models.js';
import {
  VersionConflictError,
  type EventRepository,
  type UserRepository,
} from './repository.js';

interface StoredItem {
  PK: string;
  SK: string;
  entityType: string;
  data?: unknown;
  warnings?: string[];
  order?: number;
  userId?: string;
}

const userKey = (userId: string) => `USER#${userId}`;
const emailKey = (email: string) => `EMAIL#${email}`;
const eventKey = (eventId: string) => `EVENT#${eventId}`;
const taskKey = (taskId: string) => `TASK#${taskId}`;
const budgetKey = (category: string) => `BUDGET#${category}`;
const vendorKey = (vendorId: string) => `VENDOR#${vendorId}`;

function asStored(
  item: Record<string, unknown> | undefined,
): StoredItem | undefined {
  return item as StoredItem | undefined;
}

function cancellationIsConditional(
  error: unknown,
  actionIndex: number,
): boolean {
  return (
    error instanceof TransactionCanceledException &&
    error.CancellationReasons?.[actionIndex]?.Code === 'ConditionalCheckFailed'
  );
}

async function queryAll(
  client: DynamoDBDocumentClient,
  input: QueryCommandInput,
): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const page = await client.send(
      new QueryCommand({
        ...input,
        ConsistentRead: true,
        ExclusiveStartKey: lastKey,
      }),
    );
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export class DynamoUserRepository implements UserRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async create(user: UserRecord): Promise<boolean> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: emailKey(user.email),
                  SK: 'USER',
                  entityType: 'EMAIL_LOOKUP',
                  userId: user.id,
                  data: user,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
            {
              Put: {
                TableName: this.tableName,
                Item: {
                  PK: userKey(user.id),
                  SK: 'PROFILE',
                  entityType: 'USER',
                  data: user,
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
      return true;
    } catch (error) {
      if (cancellationIsConditional(error, 0)) return false;
      throw error;
    }
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const lookup = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: emailKey(email), SK: 'USER' },
        ConsistentRead: true,
      }),
    );
    const user = asStored(lookup.Item)?.data;
    return user ? (user as UserRecord) : null;
  }
}

export class DynamoEventRepository implements EventRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async listByUser(userId: string): Promise<EventRecord[]> {
    const items = await queryAll(this.client, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :event)',
      ExpressionAttributeValues: {
        ':pk': userKey(userId),
        ':event': 'EVENT#',
      },
    });

    return items
      .map((item) => asStored(item)?.data as EventRecord | undefined)
      .filter((event): event is EventRecord => event !== undefined)
      .sort((left, right) => left.date.localeCompare(right.date));
  }

  async getPlan(userId: string, eventId: string): Promise<EventPlan | null> {
    const ownerResult = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userKey(userId), SK: eventKey(eventId) },
        ConsistentRead: true,
      }),
    );
    const owner = asStored(ownerResult.Item);
    if (!owner?.data) return null;

    const items = (
      await queryAll(this.client, {
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': eventKey(eventId) },
      })
    ).map((item) => asStored(item)!);
    const ordered = (entityType: string) =>
      items
        .filter((item) => item.entityType === entityType)
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));

    return {
      event: owner.data as EventRecord,
      budget: ordered('BUDGET').map((item) => item.data as BudgetItem),
      tasks: ordered('TASK').map((item) => item.data as PlanTask),
      vendors: ordered('VENDOR').map((item) => item.data as VendorItem),
      warnings: owner.warnings ?? [],
    };
  }

  async savePlan(plan: EventPlan, expectedVersion?: number): Promise<void> {
    const partition = eventKey(plan.event.id);
    const oldItems = await queryAll(this.client, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': partition },
      ProjectionExpression: 'PK, SK',
    });
    const newItems: StoredItem[] = [
      ...plan.budget.map((item, order) => ({
        PK: partition,
        SK: budgetKey(item.category),
        entityType: 'BUDGET',
        data: item,
        order,
      })),
      ...plan.tasks.map((item, order) => ({
        PK: partition,
        SK: taskKey(item.id),
        entityType: 'TASK',
        data: item,
        order,
      })),
      ...plan.vendors.map((item, order) => ({
        PK: partition,
        SK: vendorKey(item.id),
        entityType: 'VENDOR',
        data: item,
        order,
      })),
    ];
    const newKeys = new Set(newItems.map((item) => `${item.PK}|${item.SK}`));
    const staleItems = oldItems.filter(
      (item) => !newKeys.has(`${String(item.PK)}|${String(item.SK)}`),
    );
    const ownerCondition =
      expectedVersion === undefined
        ? {
            ConditionExpression: 'attribute_not_exists(PK)',
          }
        : {
            ConditionExpression: '#data.#version = :expectedVersion',
            ExpressionAttributeNames: {
              '#data': 'data',
              '#version': 'version',
            },
            ExpressionAttributeValues: { ':expectedVersion': expectedVersion },
          };
    const actions = [
      {
        Put: {
          TableName: this.tableName,
          Item: {
            PK: userKey(plan.event.userId),
            SK: eventKey(plan.event.id),
            entityType: 'EVENT',
            data: plan.event,
            warnings: plan.warnings,
          },
          ...ownerCondition,
        },
      },
      ...staleItems.map((item) => ({
        Delete: {
          TableName: this.tableName,
          Key: { PK: item.PK, SK: item.SK },
        },
      })),
      ...newItems.map((item) => ({
        Put: { TableName: this.tableName, Item: item },
      })),
    ];

    if (actions.length > 100) {
      throw new Error('Generated plan exceeds the DynamoDB transaction limit');
    }

    try {
      await this.client.send(
        new TransactWriteCommand({ TransactItems: actions }),
      );
    } catch (error) {
      if (cancellationIsConditional(error, 0)) throw new VersionConflictError();
      throw error;
    }
  }

  async deletePlan(
    userId: string,
    eventId: string,
    expectedVersion: number,
  ): Promise<boolean> {
    const owner = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: userKey(userId), SK: eventKey(eventId) },
        ConsistentRead: true,
      }),
    );
    if (!owner.Item) return false;
    const storedVersion = (
      asStored(owner.Item)?.data as EventRecord | undefined
    )?.version;
    if (storedVersion !== expectedVersion) throw new VersionConflictError();

    const children = await queryAll(this.client, {
      TableName: this.tableName,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': eventKey(eventId) },
      ProjectionExpression: 'PK, SK',
    });
    const actions = [
      {
        Delete: {
          TableName: this.tableName,
          Key: { PK: userKey(userId), SK: eventKey(eventId) },
          ConditionExpression: '#data.#version = :expectedVersion',
          ExpressionAttributeNames: {
            '#data': 'data',
            '#version': 'version',
          },
          ExpressionAttributeValues: { ':expectedVersion': expectedVersion },
        },
      },
      ...children.map((item) => ({
        Delete: {
          TableName: this.tableName,
          Key: { PK: item.PK, SK: item.SK },
        },
      })),
    ];

    if (actions.length > 100) {
      throw new Error('Stored plan exceeds the DynamoDB transaction limit');
    }
    try {
      await this.client.send(
        new TransactWriteCommand({ TransactItems: actions }),
      );
    } catch (error) {
      if (cancellationIsConditional(error, 0)) throw new VersionConflictError();
      throw error;
    }
    return true;
  }

  private async updateChild(
    userId: string,
    eventId: string,
    childKey: string,
    expectedVersion: number,
    updateExpression: string,
    attributeNames: Record<string, string>,
    attributeValues: Record<string, unknown>,
  ): Promise<StoredItem | null> {
    try {
      await this.client.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: userKey(userId), SK: eventKey(eventId) },
                UpdateExpression: 'SET #data.#version = :nextVersion',
                ConditionExpression: '#data.#version = :expectedVersion',
                ExpressionAttributeNames: {
                  '#data': 'data',
                  '#version': 'version',
                },
                ExpressionAttributeValues: {
                  ':nextVersion': expectedVersion + 1,
                  ':expectedVersion': expectedVersion,
                },
              },
            },
            {
              Update: {
                TableName: this.tableName,
                Key: { PK: eventKey(eventId), SK: childKey },
                UpdateExpression: updateExpression,
                ConditionExpression: 'attribute_exists(PK)',
                ExpressionAttributeNames: attributeNames,
                ExpressionAttributeValues: attributeValues,
              },
            },
          ],
        }),
      );
    } catch (error) {
      if (cancellationIsConditional(error, 0)) throw new VersionConflictError();
      if (cancellationIsConditional(error, 1)) return null;
      throw error;
    }

    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: eventKey(eventId), SK: childKey },
        ConsistentRead: true,
      }),
    );
    return asStored(result.Item) ?? null;
  }

  async updateTask(
    userId: string,
    eventId: string,
    taskId: string,
    status: PlanTask['status'],
    expectedVersion: number,
  ): Promise<PlanTask | null> {
    const item = await this.updateChild(
      userId,
      eventId,
      taskKey(taskId),
      expectedVersion,
      'SET #data.#status = :status',
      { '#data': 'data', '#status': 'status' },
      { ':status': status },
    );
    return (item?.data as PlanTask | undefined) ?? null;
  }

  async updateBudget(
    userId: string,
    eventId: string,
    category: string,
    spent: number,
    expectedVersion: number,
  ): Promise<BudgetItem | null> {
    const item = await this.updateChild(
      userId,
      eventId,
      budgetKey(category),
      expectedVersion,
      'SET #data.#spent = :spent',
      { '#data': 'data', '#spent': 'spent' },
      { ':spent': spent },
    );
    return (item?.data as BudgetItem | undefined) ?? null;
  }

  async updateVendor(
    userId: string,
    eventId: string,
    vendorId: string,
    changes: Pick<VendorItem, 'status'> & { quote?: number },
    expectedVersion: number,
  ): Promise<VendorItem | null> {
    const withQuote = changes.quote !== undefined;
    const item = await this.updateChild(
      userId,
      eventId,
      vendorKey(vendorId),
      expectedVersion,
      withQuote
        ? 'SET #data.#status = :status, #data.#quote = :quote'
        : 'SET #data.#status = :status',
      {
        '#data': 'data',
        '#status': 'status',
        ...(withQuote ? { '#quote': 'quote' } : {}),
      },
      {
        ':status': changes.status,
        ...(withQuote ? { ':quote': changes.quote } : {}),
      },
    );
    return (item?.data as VendorItem | undefined) ?? null;
  }
}
