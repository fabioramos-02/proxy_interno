const Redis = require('ioredis');
const logger = require('../utils/logger');
const { incDiscarded } = require('../api/metrics');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

let jobId = 0;
const QUEUE_KEY = 'proxy_queue';
const QUEUE_MAX_SIZE = parseInt(process.env.QUEUE_MAX_SIZE) || 100;

async function enqueue(params) {
  const size = await redis.llen(QUEUE_KEY);

  if (size >= QUEUE_MAX_SIZE) {
    incDiscarded();
    logger.warn(`Fila cheia (${size}). Job descartado.`);
    return {
      id: null,
      params,
      status: 'DROPPED',
      reason: 'queue_full',
      cached: { score: 0, message: 'Fallback response (fila cheia)' },
    };
  }

  const job = { id: ++jobId, params, createdAt: Date.now() };
  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  logger.info(`Job enqueued: ${JSON.stringify(job)}`);
  return job;
}

async function dequeue() {
  const data = await redis.rpop(QUEUE_KEY);
  return data ? JSON.parse(data) : null;
}

async function size() {
  return await redis.llen(QUEUE_KEY);
}

module.exports = { enqueue, dequeue, size };
