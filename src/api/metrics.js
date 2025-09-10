const client = require('prom-client');

// Gauge já existente
const queueSizeGauge = new client.Gauge({
  name: 'proxy_queue_size',
  help: 'Tamanho atual da fila de requisições'
});

// Contadores
const jobsProcessed = new client.Counter({
  name: 'proxy_jobs_processed_total',
  help: 'Total de jobs processados'
});
const jobsFailed = new client.Counter({
  name: 'proxy_jobs_failed_total',
  help: 'Total de jobs falhos'
});
const jobsDiscarded = new client.Counter({
  name: 'proxy_jobs_discarded_total',
  help: 'Total de jobs descartados (shed load)'
});
const jobsRetried = new client.Counter({
  name: 'proxy_jobs_retried_total',
  help: 'Total de jobs reprocessados (retry)'
});

// Histograma de latência
const upstreamLatency = new client.Histogram({
  name: 'proxy_upstream_latency_seconds',
  help: 'Latência das respostas do upstream',
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Funções para atualizar métricas
function incProcessed() { jobsProcessed.inc(); }
function incFailed() { jobsFailed.inc(); }
function incDiscarded() { jobsDiscarded.inc(); }
function incRetried() { jobsRetried.inc(); }
function observeLatency(seconds) { upstreamLatency.observe(seconds); }
function updateQueueSize(size) { queueSizeGauge.set(size); }

async function metrics(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = {
  metrics,
  updateQueueSize,
  incProcessed,
  incFailed,
  incDiscarded,
  incRetried,
  observeLatency
};