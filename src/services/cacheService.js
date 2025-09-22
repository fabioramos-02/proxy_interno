const Redis = require('ioredis');
const logger = require('../utils/logger');
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

const CACHE_TTL_SEC = parseInt(process.env.CACHE_TTL_SEC || '60', 10);

async function getCache(cpf) {
  const key = `cache:score:${cpf}`;
  const value = await redis.get(key);
  if (value) {
    logger.info(`[Cache] HIT para CPF=${cpf}`);
    return JSON.parse(value);
  }
  logger.info(`[Cache] MISS para CPF=${cpf}`);
  return null;
}

async function setCache(cpf, data) {
  const key = `cache:score:${cpf}`;
  await redis.set(key, JSON.stringify(data), 'EX', CACHE_TTL_SEC);
  logger.info(`[Cache] SET para CPF=${cpf}, TTL=${CACHE_TTL_SEC}s`);
}

module.exports = { getCache, setCache };
