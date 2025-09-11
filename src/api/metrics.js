// src/api/metrics.js
const cliente = require('prom-client');

// Fila
const queueSizeGauge = new cliente.Gauge({
  name: 'proxy_queue_size',
  help: 'Tamanho atual da fila de requisições',
});

// Jobs por status (accepted/dropped/processed/failed)
const jobsTotal = new cliente.Counter({
  name: 'proxy_jobs_total',
  help: 'Total de jobs enfileirados, processados ou descartados',
  labelNames: ['status'],
});

// Latência dos jobs
const latencyHistogram = new cliente.Histogram({
  name: 'proxy_job_latency_seconds',
  help: 'Latência de processamento dos jobs',
  buckets: [0.1, 0.5, 1, 2, 3, 5],
});

// Penalidades evitadas
const penaltiesAvoided = new cliente.Counter({
  name: 'proxy_penalties_avoided_total',
  help: 'Total de penalidades evitadas pelo proxy',
});

// Funções auxiliares
function atualizarTamanhoFila(size) {
  queueSizeGauge.set(size);
}
function incrementarJobs(status) {
  jobsTotal.inc({ status });
}
function observarLatencia(seconds) {
  latencyHistogram.observe(seconds);
}
function incrementarDescartados() {
  jobsTotal.inc({ status: 'dropped' });
}
function incrementarPenalidadesEvitadas() {
  penaltiesAvoided.inc();
}

// Endpoint de métricas
async function metricas(req, res) {
  res.set('Content-Type', cliente.register.contentType);
  res.end(await cliente.register.metrics());
}

module.exports = {
  metricas,
  atualizarTamanhoFila,
  incrementarJobs,
  observarLatencia,
  incrementarDescartados,
  incrementarPenalidadesEvitadas,
};
