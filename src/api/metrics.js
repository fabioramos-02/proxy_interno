const client = require('prom-client');

// Métricas
const queueSizeGauge = new client.Gauge({
  name: 'proxy_queue_size',
  help: 'Tamanho atual da fila de requisições'
});

const jobsTotal = new client.Counter({
  name: 'proxy_jobs_total',
  help: 'Total de jobs enfileirados',
  labelNames: ['status'], // accepted, dropped, processed, failed
});

const latencyHistogram = new client.Histogram({
  name: 'proxy_job_latency_seconds',
  help: 'Latência de processamento dos jobs',
  buckets: [0.1, 0.5, 1, 2, 3, 5]
});

function updateQueueSize(size) {
  queueSizeGauge.set(size);
}

function incJobs(status) {
  jobsTotal.inc({ status });
}

function observeLatency(seconds) {
  latencyHistogram.observe(seconds);
}

async function metrics(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

function incDiscarded() {
  jobsTotal.inc({ status: 'dropped' });
}

module.exports = { metrics, updateQueueSize, incJobs, observeLatency, incDiscarded };
