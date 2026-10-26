import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { env } from './env.js';

const client = new DynamoDBClient({
  region: env.AWS_REGION,
  ...(env.DDB_ENDPOINT ? { endpoint: env.DDB_ENDPOINT } : {}),
});

export const documentClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});
