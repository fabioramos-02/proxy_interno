// src/api/metrics.js
const client = require('prom-client');

// Fila
const queueSizeGauge = new client.Gauge({
  name: 'proxy_queue_size',
  help: 'Tamanho atual da fila de requisições',
});

// Jobs por status (accepted/dropped/processed/failed)
const jobsTotal = new client.Counter({
  name: 'proxy_jobs_total',
  help: 'Total de jobs enfileirados, processados ou descartados',
  labelNames: ['status'],
});

// Latência dos jobs
const latencyHistogram = new client.Histogram({
  name: 'proxy_job_latency_seconds',
  help: 'Latência de processamento dos jobs',
  buckets: [0.1, 0.5, 1, 2, 3, 5],
});

// Penalidades evitadas
const penaltiesAvoided = new client.Counter({
  name: 'proxy_penalties_avoided_total',
  help: 'Total de penalidades evitadas pelo proxy',
});

// Funções auxiliares
function updateQueueSize(size) {
  queueSizeGauge.set(size);
}
function incJobs(status) {
  jobsTotal.inc({ status });
}
function observeLatency(seconds) {
  latencyHistogram.observe(seconds);
}
function incDiscarded() {
  jobsTotal.inc({ status: 'dropped' });
}
function incPenaltiesAvoided() {
  penaltiesAvoided.inc();
}

// Endpoint de métricas
async function metrics(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = {
  metrics,
  updateQueueSize,
  incJobs,
  observeLatency,
  incDiscarded,
  incPenaltiesAvoided,
};
