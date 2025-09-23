// src/config/redis.js
const Redis = require('ioredis');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
});

async function close() {
  await redis.quit();
}

module.exports = redis;
module.exports.close = close;
