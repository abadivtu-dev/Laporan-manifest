import pino from 'pino';

export const logger = pino({
  name: 'laporan-wa',
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
});
