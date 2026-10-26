import 'dotenv/config';
import { z } from 'zod';

const EXAMPLE_JWT_SECRET = 'change-this-to-at-least-32-characters';
const optionalUrlSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.url().optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(8080),
  FRONTEND_ORIGIN: z.url().default('http://localhost:5173'),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DDB_TABLE_NAME: z.string().min(1).default('eventplanner-dev'),
  DDB_ENDPOINT: optionalUrlSchema,
  BEDROCK_MODEL_ID: z.string().optional(),
  BEDROCK_GUARDRAIL_ID: z.string().optional(),
  BEDROCK_GUARDRAIL_VERSION: z.string().optional(),
  JWT_SECRET: z.string().min(32),
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

if (
  parsedEnvironment.data.NODE_ENV === 'production' &&
  parsedEnvironment.data.JWT_SECRET === EXAMPLE_JWT_SECRET
) {
  throw new Error(
    'Invalid environment configuration: replace the example JWT_SECRET',
  );
}

export const env = parsedEnvironment.data;
