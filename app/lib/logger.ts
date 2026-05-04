import pino from 'pino';

function createLogger() {
  if (process.env.NODE_ENV === 'test') {
    return pino({ level: 'silent' });
  }
  const logDir = process.env.LOG_DIR ?? './var/logs';
  const retention = Number(process.env.LOG_RETENTION ?? 30);
  const transport = pino.transport({
    target: 'pino-roll',
    options: {
      file: `${logDir}/app.log`,
      frequency: 'daily',
      mkdir: true,
      size: '10m',
      limit: { count: retention },
    },
  });
  return pino({ level: process.env.LOG_LEVEL ?? 'info' }, transport);
}

export const logger = createLogger();
