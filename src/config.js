require('dotenv').config();

module.exports = {
  QUEUE_MAX_SIZE: parseInt(process.env.QUEUE_MAX_SIZE) || 100,
  RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT) || 3,
  TIMEOUT_MS: parseInt(process.env.TIMEOUT_MS) || 5000,
  CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5,
  PORT: process.env.PORT || 3000,
};
