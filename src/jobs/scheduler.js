const axios = require('axios');
const queueService = require('../services/queueService');

const UPSTREAM_URL = 'https://score.hsborges.dev/score'; // endpoint externo

async function processQueue() {
  const queue = queueService.getQueue();
  if (queue.length === 0) return;

  const job = queue.shift();
  try {
    // Faz a chamada para o upstream com os parâmetros do job
    const response = await axios.get(UPSTREAM_URL, { params: job.params });
    console.log(`[Scheduler] Job ${job.id} processado com sucesso`, response.data);
    // Aqui você pode salvar o resultado, atualizar status, etc.
  } catch (err) {
    console.error(`[Scheduler] Erro ao processar job ${job.id}:`, err.message);
    // Estratégia de retry ou fallback pode ser implementada aqui
  }
}

// Executa o processQueue a cada 1 segundo (rate limit)
setInterval(processQueue, 1000);

module.exports = { processQueue };