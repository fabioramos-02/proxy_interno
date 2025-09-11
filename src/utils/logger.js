const { createLogger, format, transports } = require('winston');

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'HH:mm:ss' }),
    format.errors({ stack: true }),
    format.colorize(),
    format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} [${level}]: ${stack || message}`;
    })
  ),
  transports: [
    new transports.Console()
  ]
});

module.exports = logger;