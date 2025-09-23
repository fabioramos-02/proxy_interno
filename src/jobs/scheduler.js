// src/jobs/scheduler.js
const axios = require("axios");
const queueService = require("../services/queueService");
const cacheService = require("../services/cacheService");
const logger = require("../utils/logger");
const {
  atualizarTamanhoFila,
  incrementarJobs,
  observarLatencia,
  setEstadoCircuito,
  incCircuitoAbriu,
  incCircuitoFechou,
  incCircuitoMeiaAbertura,
  incCurtoCircuito,
  incTimeout,
  incErroUpstream,
  incPenalidadeRateLimit,
  incFallback,
} = require("../api/metrics");

const client = require("prom-client");
const schedulerIntervalGauge = new client.Gauge({
  name: "proxy_scheduler_interval_ms",
  help: "Intervalo atual do scheduler em ms",
});

// Configurações
const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://score.hsborges.dev/api/score";
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "3000", 10);
const BREAKER_FAILURE_THRESHOLD = parseInt(process.env.BREAKER_FAILURE_THRESHOLD || "3", 10);
const BREAKER_OPEN_WINDOW_MS = parseInt(process.env.BREAKER_OPEN_WINDOW_MS || "10000", 10);
const SCHEDULER_INITIAL_INTERVAL_MS = parseInt(process.env.SCHEDULER_INITIAL_INTERVAL_MS || "1000", 10);

// Intervalos dinâmicos
let interval = SCHEDULER_INITIAL_INTERVAL_MS;
let timer = null;
let sizeInterval = null;

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(processQueue, interval);
}

function startSizeWatcher() {
  if (sizeInterval) clearInterval(sizeInterval);
  sizeInterval = setInterval(async () => {
    const size = await queueService.size();
    atualizarTamanhoFila(size);
  }, 2000);
}

// Só inicia automaticamente se NÃO estiver em ambiente de teste
if (process.env.NODE_ENV !== "test" || process.env.SCHEDULER_FORCE_START === "true") {
  startTimer();
  startSizeWatcher();
}
function adjustScheduler(newInterval) {
  if (timer) clearInterval(timer);
  interval = newInterval;
  schedulerIntervalGauge.set(interval);
  startTimer();
  logger.warn(`[Scheduler] Ajustando cadência`, { intervalMs: interval });
}

// Circuit Breaker
let breakerState = "fechado";
let consecutiveFailures = 0;
let openedAt = 0;
let probeAllowed = false;
setEstadoCircuito("fechado");

function openBreaker(motivo) {
  breakerState = "aberto";
  openedAt = Date.now();
  probeAllowed = false;
  setEstadoCircuito("aberto");
  incCircuitoAbriu();
  logger.warn(`[Breaker] ABERTO`, { motivo, openWindowMs: BREAKER_OPEN_WINDOW_MS });
}

function toHalfOpen() {
  breakerState = "meia-abertura";
  probeAllowed = true;
  setEstadoCircuito("meia-abertura");
  incCircuitoMeiaAbertura();
  logger.warn(`[Breaker] MEIA-ABERTURA`, { probe: true });
}

function closeBreaker() {
  breakerState = "fechado";
  consecutiveFailures = 0;
  probeAllowed = false;
  setEstadoCircuito("fechado");
  incCircuitoFechou();
  logger.warn(`[Breaker] FECHADO`);
}

async function processQueue() {
  const job = await queueService.dequeue();
  if (!job) return;

  const { cpf } = job.params || {};
  if (!cpf) return;

  const start = Date.now();

  try {
    // 1. Verifica cache
    const cached = await cacheService.getCache(cpf);
    if (cached) {
      incrementarJobs("cached");
      logger.info(`[Scheduler] Resposta do cache para job ${job.id}`);
      return;
    }

    // 2. Verifica breaker
    if (breakerState === "aberto") {
      const elapsed = Date.now() - openedAt;
      if (elapsed < BREAKER_OPEN_WINDOW_MS) {
        incCurtoCircuito();
        incFallback("breaker_aberto");
        incrementarJobs("fallback");
        logger.warn(`[Breaker] Curto-circuito`, { remainingMs: BREAKER_OPEN_WINDOW_MS - elapsed });
        return;
      }
      toHalfOpen();
    }

    if (breakerState === "meia-abertura" && !probeAllowed) {
      incCurtoCircuito();
      incFallback("breaker_meia_abertura_bloqueado");
      incrementarJobs("fallback");
      logger.warn(`[Breaker] Meia-abertura bloqueado aguardando prova`);
      return;
    }

    // 3. Chamada ao upstream
    const response = await axios.get(UPSTREAM_URL, {
      params: { cpf },
      headers: { "client-id": "1", accept: "application/json" },
      timeout: REQUEST_TIMEOUT_MS,
    });

    // 4. Salva cache
    await cacheService.setCache(cpf, response.data);

    incrementarJobs("processed");
    observarLatencia((Date.now() - start) / 1000);
    logger.info(`[Scheduler] Job processado: ${job.id}`);

    if (interval > 1000) adjustScheduler(1000);

    if (breakerState === "meia-abertura") {
      closeBreaker();
    } else {
      consecutiveFailures = 0;
    }
    probeAllowed = false;
  } catch (err) {
    incrementarJobs("failed");
    const status = err.response?.status;
    logger.error(`[Scheduler] Erro no job`, { jobId: job.id, status, message: err.message });

    // fallback via cache
    const fallback = await cacheService.getCache(cpf);
    if (fallback) {
      incrementarJobs("fallback_cached");
      incFallback("cache_fallback");
      logger.warn(`[Scheduler] Fallback via cache para job ${job.id}`);
      return;
    }

    if (status === 429) {
      adjustScheduler(3000);
      incPenalidadeRateLimit();
      consecutiveFailures++;
    } else if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      incTimeout();
      incFallback("timeout");
      consecutiveFailures++;
    } else if (status && status >= 500) {
      incErroUpstream(status);
      incFallback("erro_5xx");
      consecutiveFailures++;
    } else {
      incErroUpstream(status || "unknown");
      consecutiveFailures++;
    }

    if (breakerState === "meia-abertura") {
      openBreaker("falha_na_prova");
    } else if (breakerState === "fechado" && consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) {
      openBreaker(`falhas_consecutivas=${consecutiveFailures}`);
    }
  }
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (sizeInterval) {
    clearInterval(sizeInterval);
    sizeInterval = null;
  }
}

function start() {
  startTimer();
  startSizeWatcher();
}
module.exports = { processQueue, stop, start };
