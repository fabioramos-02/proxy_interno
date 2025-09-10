// src/jobs/scheduler.js
const axios = require("axios");
const queueService = require("../services/queueService");
const {
  updateQueueSize,
  incJobs,
  observeLatency,
} = require("../api/metrics");

const client = require("prom-client");
const schedulerIntervalGauge = new client.Gauge({
  name: "proxy_scheduler_interval_ms",
  help: "Intervalo atual do scheduler em ms",
});

const UPSTREAM_URL = "https://score.hsborges.dev/api/score";

// 🔹 Intervalo dinâmico do scheduler
let interval = 1000; // começa com 1s
let timer = setInterval(processQueue, interval);

function adjustScheduler(newInterval) {
  clearInterval(timer);
  interval = newInterval;
  schedulerIntervalGauge.set(interval); // métrica Prometheus
  timer = setInterval(processQueue, interval);
  console.warn(`[Scheduler] Ajustando cadência para ${interval}ms`);
}

async function processQueue() {
  const job = await queueService.dequeue();
  if (!job) return;

  const start = Date.now();
  try {
    // 🔹 Filtra apenas parâmetros válidos para o upstream
    const params = {};
    if (job.params?.cpf) params.cpf = job.params.cpf;

    const response = await axios.get(UPSTREAM_URL, {
      params,
      headers: {
        "client-id": "1", // obrigatório
        accept: "application/json",
      },
    });

    incJobs("processed");
    observeLatency((Date.now() - start) / 1000);

    console.log(`[Scheduler] Job ${job.id} processado`, response.data);

    // 🔹 Se estava em penalidade, volta para 1s
    if (interval > 1000) adjustScheduler(1000);
  } catch (err) {
    incJobs("failed");

    const status = err.response?.status;
    console.error(
      `[Scheduler] Erro no job ${job.id}: status=${status}, msg=${err.message}`
    );

    if (status === 429) {
      // penalidade: aumenta para 3s
      adjustScheduler(3000);
    }
  }
}

// 🔹 Atualiza a métrica do tamanho da fila
setInterval(async () => {
  const size = await queueService.size();
  updateQueueSize(size);
}, 2000);

module.exports = { processQueue };
