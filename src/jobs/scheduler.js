const axios = require('axios');
const queueService = require('../services/queueService');
const { updateQueueSize } = require('../api/metrics');

const UPSTREAM_URL = 'https://score.hsborges.dev/score';

async function processQueue() {
  const job = await queueService.dequeue();
  if (!job) return;

  try {
    const response = await axios.get(UPSTREAM_URL, { params: job.params });
    console.log(`[Scheduler] Job ${job.id} processado com sucesso`, response.data);
  } catch (err) {
    console.error(`[Scheduler] Erro ao processar job ${job.id}:`, err.message);
  }
}

// Executa o processamento da fila a cada 1 segundo
setInterval(processQueue, 1000);

// Atualiza métrica do tamanho da fila a cada 2 segundos
setInterval(async () => {
  const size = await queueService.size();
  updateQueueSize(size);
}, 2000);

module.exports = { processQueue };
