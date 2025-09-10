const axios = require('axios');
const queueService = require('../services/queueService');
const { updateQueueSize, incJobs, observeLatency } = require('../api/metrics');

const UPSTREAM_URL = 'https://score.hsborges.dev/score';

async function processQueue() {
  const job = await queueService.dequeue();
  if (!job) return;

  const start = Date.now();
  try {
    const response = await axios.get(UPSTREAM_URL, { params: job.params });
    incJobs('processed');
    observeLatency((Date.now() - start) / 1000);
    console.log(`[Scheduler] Job ${job.id} processado`, response.data);
  } catch (err) {
    incJobs('failed');
    console.error(`[Scheduler] Erro no job ${job.id}:`, err.message);
  }
}

// Loop de processamento
setInterval(processQueue, 1000);

// Loop de atualização da métrica da fila
setInterval(async () => {
  const size = await queueService.size();
  updateQueueSize(size);
}, 2000);

module.exports = { processQueue };
