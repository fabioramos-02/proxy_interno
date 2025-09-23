// src/services/cacheService.js
const Redis = require("ioredis");
const logger = require("../utils/logger");

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
});

const CACHE_TTL_SEC = parseInt(process.env.CACHE_TTL_SEC || "60", 10);
const CACHE_DISABLED = process.env.DISABLE_CACHE === "true";

/**
 * Recupera valor do cache para um CPF.
 * @param {string} cpf
 * @returns {Promise<object|null>}
 */
async function getCache(cpf) {
  if (CACHE_DISABLED) {
    logger.debug(`[Cache] Ignorado (DISABLE_CACHE=true) para CPF=${cpf}`);
    return null;
  }

  const key = `cache:score:${cpf}`;
  const value = await redis.get(key);

  if (value) {
    logger.info(`[Cache] HIT para CPF=${cpf}`);
    return JSON.parse(value);
  }

  logger.info(`[Cache] MISS para CPF=${cpf}`);
  return null;
}

/**
 * Armazena valor no cache para um CPF.
 * @param {string} cpf
 * @param {object} data
 */
async function setCache(cpf, data) {
  if (CACHE_DISABLED) {
    logger.debug(`[Cache] SET ignorado (DISABLE_CACHE=true) para CPF=${cpf}`);
    return;
  }

  const key = `cache:score:${cpf}`;
  await redis.set(key, JSON.stringify(data), "EX", CACHE_TTL_SEC);
  logger.info(`[Cache] SET para CPF=${cpf}, TTL=${CACHE_TTL_SEC}s`);
}

/**
 * Fecha conexão com Redis (usado em testes).
 */
async function quit() {
  await redis.quit();
}

module.exports = { getCache, setCache, quit };
