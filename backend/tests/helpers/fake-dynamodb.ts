import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

type Item = Record<string, unknown>;
type Names = Record<string, string> | undefined;
type Values = Record<string, unknown> | undefined;

const keyOf = (item: Item) => `${String(item.PK)}|${String(item.SK)}`;

function resolvePath(path: string, names: Names): string[] {
  return path
    .trim()
    .split('.')
    .map((part) => (part.startsWith('#') ? (names?.[part] ?? part) : part));
}

function readPath(item: Item, path: string[]): unknown {
  let current: unknown = item;
  for (const part of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Item)[part];
  }
  return current;
}

function writePath(item: Item, path: string[], value: unknown) {
  let current = item;
  for (const part of path.slice(0, -1)) {
    current = current[part] as Item;
  }
  current[path[path.length - 1]!] = value;
}

/** Evaluates the small set of condition expressions the repository uses. */
function conditionHolds(
  existing: Item | undefined,
  expression: string | undefined,
  names: Names,
  values: Values,
): boolean {
  if (!expression) return true;
  if (expression === 'attribute_not_exists(PK)') return existing === undefined;
  if (expression === 'attribute_exists(PK)') return existing !== undefined;
  const comparison = /^(\S+) = (:\w+)$/.exec(expression);
  if (!comparison) throw new Error(`Unsupported condition: ${expression}`);
  if (!existing) return false;
  return (
    readPath(existing, resolvePath(comparison[1]!, names)) ===
    values?.[comparison[2]!]
  );
}

function applyUpdate(
  item: Item,
  expression: string,
  names: Names,
  values: Values,
) {
  if (!expression.startsWith('SET ')) {
    throw new Error(`Unsupported update: ${expression}`);
  }
  for (const assignment of expression.slice(4).split(',')) {
    const [path, placeholder] = assignment
      .split('=')
      .map((part) => part.trim());
    writePath(item, resolvePath(path!, names), values?.[placeholder!]);
  }
}

/**
 * Minimal in-memory stand-in for DynamoDBDocumentClient. It implements only
 * the commands and expressions used by the repositories, including
 * transactional all-or-nothing writes and per-action cancellation reasons.
 */
export class FakeDynamoClient {
  readonly items = new Map<string, Item>();
  readonly commands: unknown[] = [];
  /** Forces Query to return this many items per page to exercise paging. */
  pageSize = Number.POSITIVE_INFINITY;
  /** Rejects the next transaction with this error, then clears itself. */
  failNextTransaction: Error | undefined;

  get client(): DynamoDBDocumentClient {
    return this as unknown as DynamoDBDocumentClient;
  }

  async send(command: unknown): Promise<Record<string, unknown>> {
    this.commands.push(command);
    if (command instanceof GetCommand) {
      const key = command.input.Key as Item;
      const item = this.items.get(keyOf(key));
      return item ? { Item: structuredClone(item) } : {};
    }
    if (command instanceof QueryCommand) return this.query(command);
    if (command instanceof TransactWriteCommand) return this.transact(command);
    throw new Error('Unsupported command');
  }

  private query(command: QueryCommand): Record<string, unknown> {
    const input = command.input;
    const values = input.ExpressionAttributeValues ?? {};
    const prefix = values[':event'] as string | undefined;
    const matches = [...this.items.values()]
      .filter((item) => item.PK === values[':pk'])
      .filter((item) => !prefix || String(item.SK).startsWith(prefix))
      .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
    const start = input.ExclusiveStartKey
      ? matches.findIndex(
          (item) => keyOf(item) === keyOf(input.ExclusiveStartKey!),
        ) + 1
      : 0;
    const page = matches.slice(start, start + this.pageSize);
    const hasMore = start + this.pageSize < matches.length;
    return {
      Items: structuredClone(page),
      ...(hasMore
        ? { LastEvaluatedKey: { PK: page.at(-1)!.PK, SK: page.at(-1)!.SK } }
        : {}),
    };
  }

  private transact(command: TransactWriteCommand): Record<string, unknown> {
    if (this.failNextTransaction) {
      const error = this.failNextTransaction;
      this.failNextTransaction = undefined;
      throw error;
    }
    const actions = command.input.TransactItems ?? [];
    const staged = new Map(this.items);
    const reasons = actions.map(() => ({ Code: 'None' }));
    let cancelled = false;

    actions.forEach((action, index) => {
      const spec = action.Put ?? action.Delete ?? action.Update;
      const key = (action.Put?.Item ?? spec?.Key) as Item;
      const existing = staged.get(keyOf(key));
      const names = spec?.ExpressionAttributeNames as Names;
      const values = spec?.ExpressionAttributeValues as Values;
      if (!conditionHolds(existing, spec?.ConditionExpression, names, values)) {
        reasons[index] = { Code: 'ConditionalCheckFailed' };
        cancelled = true;
        return;
      }
      if (action.Put)
        staged.set(keyOf(key), structuredClone(action.Put.Item as Item));
      else if (action.Delete) staged.delete(keyOf(key));
      else if (action.Update && existing) {
        const copy = structuredClone(existing);
        applyUpdate(copy, action.Update.UpdateExpression!, names, values);
        staged.set(keyOf(key), copy);
      }
    });

    if (cancelled) {
      throw new TransactionCanceledException({
        $metadata: {},
        message: 'Transaction cancelled',
        CancellationReasons: reasons,
      });
    }
    this.items.clear();
    staged.forEach((value, key) => this.items.set(key, value));
    return {};
  }
}
