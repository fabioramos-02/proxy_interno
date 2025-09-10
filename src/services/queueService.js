const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

let jobId = 0;
const QUEUE_KEY = 'proxy_queue';

async function enqueue(params) {
  const job = { id: ++jobId, params, createdAt: Date.now() };
  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  logger.info(`Job enqueued: ${JSON.stringify(job)}`);
  return job;
}

// Retira próximo job da fila
async function dequeue() {
  const data = await redis.rpop(QUEUE_KEY);
  return data ? JSON.parse(data) : null;
}

// Pega tamanho atual da fila
async function size() {
  return await redis.llen(QUEUE_KEY);
}

module.exports = { enqueue, dequeue, size };
