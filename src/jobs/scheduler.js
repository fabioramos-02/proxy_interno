// src/jobs/scheduler.js
const axios = require("axios");
const queueService = require("../services/queueService");
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

// Configurações (via .env com defaults sensatos)
const UPSTREAM_URL = process.env.UPSTREAM_URL ||
  "https://score.hsborges.dev/api/score";
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || "3000", 10);
const BREAKER_FAILURE_THRESHOLD = parseInt(
  process.env.BREAKER_FAILURE_THRESHOLD || "3",
  10
);
const BREAKER_OPEN_WINDOW_MS = parseInt(
  process.env.BREAKER_OPEN_WINDOW_MS || "10000",
  10
);
const SCHEDULER_INITIAL_INTERVAL_MS = parseInt(
  process.env.SCHEDULER_INITIAL_INTERVAL_MS || "1000",
  10
);

// Intervalo dinâmico do scheduler
let interval = SCHEDULER_INITIAL_INTERVAL_MS;
let timer = null;
function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(processQueue, interval);
}
if (!(process.env.NODE_ENV === 'test' && process.env.SCHEDULER_FORCE_START !== 'true')) {
  startTimer();
}

function adjustScheduler(newInterval) {
  if (timer) clearInterval(timer);
  interval = newInterval;
  schedulerIntervalGauge.set(interval); // métrica Prometheus
  startTimer();
  logger.warn(`[Scheduler] Ajustando cadência`, { intervalMs: interval });
}

// Circuit Breaker (simples)
let breakerState = "fechado"; // 'fechado' | 'aberto' | 'meia-abertura'
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
  probeAllowed = true; // permite 1 tentativa
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

  const start = Date.now();
  try {
    // Se breaker está aberto, verifica janela
    if (breakerState === "aberto") {
      const elapsed = Date.now() - openedAt;
      if (elapsed < BREAKER_OPEN_WINDOW_MS) {
        // evita chamada
        incCurtoCircuito();
        incFallback("breaker_aberto");
        incrementarJobs("fallback");
        logger.warn(`[Breaker] Curto-circuito`, { remainingMs: BREAKER_OPEN_WINDOW_MS - elapsed });
        return;
      }
      toHalfOpen();
    }

    // Filtra apenas parâmetros válidos para o upstream
    const params = {};
    if (job.params?.cpf) params.cpf = job.params.cpf;

    // Se meia-abertura e já usamos a prova, bloqueia novas tentativas até fechar/abrir de novo
    if (breakerState === "meia-abertura" && !probeAllowed) {
      incCurtoCircuito();
      incFallback("breaker_meia_abertura_bloqueado");
      incrementarJobs("fallback");
      logger.warn(`[Breaker] Meia-abertura bloqueado aguardando prova`);
      return;
    }

    // Chamada ao upstream (com timeout)
    const response = await axios.get(UPSTREAM_URL, {
      params,
      headers: {
        "client-id": "1", // obrigatório
        accept: "application/json",
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    incrementarJobs("processed");
    observarLatencia((Date.now() - start) / 1000);

    logger.info(`[Scheduler] Job processado: ${job.id}`);

    // Se estava em penalidade, volta para 1s
    if (interval > 1000) adjustScheduler(1000);

    // Sucesso: se estava em meia-abertura, fecha
    if (breakerState === "meia-abertura") {
      closeBreaker();
    } else {
      // estado normal
      consecutiveFailures = 0;
    }
    probeAllowed = false;
  } catch (err) {
    incrementarJobs("failed");

    const status = err.response?.status;
    logger.error(`[Scheduler] Erro no job`, { jobId: job.id, status, message: err.message });

    if (status === 429) {
      // penalidade: aumenta para 3s
      adjustScheduler(3000);
      incPenalidadeRateLimit();
      // 429 conta como falha para o breaker também, para ser conservador
      consecutiveFailures++;
    } else if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      // timeout
      incTimeout();
      incFallback("timeout");
      consecutiveFailures++;
    } else if (status && status >= 500) {
      incErroUpstream(status);
      incFallback("erro_5xx");
      consecutiveFailures++;
    } else {
      // outros erros: registra
      incErroUpstream(status || "unknown");
      consecutiveFailures++;
    }

    // Transições do breaker
    if (breakerState === "meia-abertura") {
      // prova falhou → abre novamente
      openBreaker("falha_na_prova");
    } else if (
      breakerState === "fechado" &&
      consecutiveFailures >= BREAKER_FAILURE_THRESHOLD
    ) {
      openBreaker(`falhas_consecutivas=${consecutiveFailures}`);
    }
  }
}

// Atualiza a métrica do tamanho da fila
setInterval(async () => {
  const size = await queueService.size();
  atualizarTamanhoFila(size);
}, 2000);

module.exports = { processQueue };
