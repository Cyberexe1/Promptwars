import pino from 'pino';
import { app } from './app.js';
import { env } from './config/env.js';

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server started');
});
