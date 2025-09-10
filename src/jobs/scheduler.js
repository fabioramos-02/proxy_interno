const axios = require('axios');
const queueService = require('../services/queueService');
const { updateQueueSize, incJobs, observeLatency } = require('../api/metrics');

const UPSTREAM_URL = 'https://score.hsborges.dev/api/score'; // URL corrigida

async function processQueue() {
  const job = await queueService.dequeue();
  if (!job) return;

  const start = Date.now();
  try {
    const response = await axios.get(UPSTREAM_URL, {
      params: job.params,
      headers: {
        'client-id': '1',           // header obrigatório
        'accept': 'application/json'
      }
    });

    incJobs('processed');
    observeLatency((Date.now() - start) / 1000);

    console.log(`[Scheduler] Job ${job.id} processado`, response.data);
  } catch (err) {
    incJobs('failed');
    console.error(`[Scheduler] Erro no job ${job.id}:`, err.response?.status, err.message);
  }
}

// Loop de processamento
setInterval(processQueue, 1000);

// Atualiza a métrica do tamanho da fila
setInterval(async () => {
  const size = await queueService.size();
  updateQueueSize(size);
}, 2000);

module.exports = { processQueue };
