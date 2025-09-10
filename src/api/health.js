const Redis = require('ioredis');
const { version } = require('../../package.json');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

async function health(req, res) {
  const checks = {
    redis: false,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version,
  };

  try {
    // Testa conexão com Redis (ping)
    const pong = await redis.ping();
    checks.redis = pong === 'PONG';
  } catch (err) {
    checks.redis = false;
  }

  // Define status geral
  const status = checks.redis ? 'ok' : 'degraded';

  res.status(checks.redis ? 200 : 500).json({
    status,
    checks,
  });
}

module.exports = { health };
