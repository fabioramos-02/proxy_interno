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

// Circuit Breaker
const circuitStateGauge = new cliente.Gauge({
  name: 'proxy_circuit_state',
  help: 'Estado do circuit breaker (0=fechado, 0.5=meia-abertura, 1=aberto)',
});
const circuitOpenTotal = new cliente.Counter({
  name: 'proxy_circuit_open_total',
  help: 'Total de vezes que o circuit breaker abriu',
});
const circuitCloseTotal = new cliente.Counter({
  name: 'proxy_circuit_close_total',
  help: 'Total de vezes que o circuit breaker fechou',
});
const circuitHalfOpenTotal = new cliente.Counter({
  name: 'proxy_circuit_half_open_total',
  help: 'Total de transições para meia-abertura',
});
const shortCircuitsTotal = new cliente.Counter({
  name: 'proxy_short_circuits_total',
  help: 'Total de chamadas evitadas por breaker aberto',
});
const timeoutsTotal = new cliente.Counter({
  name: 'proxy_timeouts_total',
  help: 'Total de timeouts ao chamar o upstream',
});
const upstreamErrorsTotal = new cliente.Counter({
  name: 'proxy_upstream_errors_total',
  help: 'Total de erros do upstream, por código',
  labelNames: ['code'],
});
const rateLimitPenaltiesTotal = new cliente.Counter({
  name: 'proxy_rate_limit_penalties_total',
  help: 'Total de penalidades de rate limit (429) detectadas',
});
const fallbacksTotal = new cliente.Counter({
  name: 'proxy_fallbacks_total',
  help: 'Total de fallbacks fornecidos',
  labelNames: ['motivo'],
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

// Funções de observabilidade (RNF5)
function setEstadoCircuito(estado) {
  // 'fechado' | 'meia-abertura' | 'aberto'
  const mapa = { 'fechado': 0, 'meia-abertura': 0.5, 'aberto': 1 };
  circuitStateGauge.set(mapa[estado] ?? 0);
}
function incCircuitoAbriu() {
  circuitOpenTotal.inc();
}
function incCircuitoFechou() {
  circuitCloseTotal.inc();
}
function incCircuitoMeiaAbertura() {
  circuitHalfOpenTotal.inc();
}
function incCurtoCircuito() {
  shortCircuitsTotal.inc();
}
function incTimeout() {
  timeoutsTotal.inc();
}
function incErroUpstream(code) {
  upstreamErrorsTotal.inc({ code: String(code || 'unknown') });
}
function incPenalidadeRateLimit() {
  rateLimitPenaltiesTotal.inc();
}
function incFallback(motivo) {
  fallbacksTotal.inc({ motivo });
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
  setEstadoCircuito,
  incCircuitoAbriu,
  incCircuitoFechou,
  incCircuitoMeiaAbertura,
  incCurtoCircuito,
  incTimeout,
  incErroUpstream,
  incPenalidadeRateLimit,
  incFallback,
};
