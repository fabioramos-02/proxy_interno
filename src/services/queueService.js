// Exemplo simples usando array em memória (troque por Redis depois)
const logger = require('../utils/logger');
const queue = [];
let jobId = 0;

async function enqueue(params) {
  const job = { id: ++jobId, params, createdAt: Date.now() };
  logger.info(`Job enqueued: ${JSON.stringify(job)}`);
  queue.push(job);
  return job;
}

function getQueue() {
  return queue;
}

module.exports = { enqueue, getQueue };