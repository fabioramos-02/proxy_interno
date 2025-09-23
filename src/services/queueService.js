const redis = require("../config/redis");
const logger = require("../utils/logger");
const { incrementarDescartados, incrementarJobs } = require("../api/metrics");

let jobId = 0;
const QUEUE_PREFIX = "proxy_queue";
const PRIORITIES = ["high", "normal", "low"];
const QUEUE_MAX_SIZE = parseInt(process.env.QUEUE_MAX_SIZE || "100", 10);
const JOB_TTL_MS = parseInt(process.env.JOB_TTL_MS || "10000", 10);

function keyFor(priority) {
  return `${QUEUE_PREFIX}:${priority}`;
}

async function totalSize() {
  const sizes = await Promise.all(PRIORITIES.map((p) => redis.llen(keyFor(p))));
  return sizes.reduce((a, b) => a + b, 0);
}

function resolvePriority(params = {}) {
  const p = (params.priority || params.prioridade || "")
    .toString()
    .toLowerCase();
  if (PRIORITIES.includes(p)) return p;

  // Heurística por tipo
  const tipo = (params.type || params.tipo || "").toString().toLowerCase();
  if (["update", "atualizacao", "atualização"].includes(tipo)) return "high";
  if (["low", "baixa"].includes(tipo)) return "low";
  return "normal";
}

async function tryPreemptFor(priority) {
  if (priority === "high") {
    let victim = await redis.rpop(keyFor("low"));
    if (!victim) victim = await redis.rpop(keyFor("normal"));
    if (victim) {
      incrementarDescartados();
      logger.warn(
        "Preempção: removido job de prioridade menor para abrir espaço (high)"
      );
      return true;
    }
  } else if (priority === "normal") {
    const victim = await redis.rpop(keyFor("low"));
    if (victim) {
      incrementarDescartados();
      logger.warn(
        "Preempção: removido job de prioridade baixa para abrir espaço (normal)"
      );
      return true;
    }
  }
  return false;
}

async function enqueue(params, options = {}) {
  const ttlMs = parseInt(options.ttlMs || JOB_TTL_MS, 10);
  const priority = resolvePriority(params);

  let size = await totalSize();
  if (size >= QUEUE_MAX_SIZE) {
    const madeRoom = await tryPreemptFor(priority);
    if (!madeRoom) {
      incrementarDescartados(); // ✅ garante incremento no Counter
      logger.warn(`Fila cheia (${size}). Job descartado.`, {
        priority,
        reason: "queue_full",
      });
      return {
        id: null,
        params,
        status: "DROPPED",
        reason: "queue_full",
        priority,
        cached: { score: 0, message: "Fallback response (fila cheia)" },
      };
    }
  }

  const now = Date.now();
  const job = {
    id: ++jobId,
    params,
    priority,
    createdAt: now,
    expiresAt: now + Math.max(0, ttlMs),
  };

  await redis.lpush(keyFor(priority), JSON.stringify(job));
  try {
    incrementarJobs("accepted");
  } catch (_) {}
  logger.info(`Job enqueued: ${JSON.stringify(job)}`);

  return job;
}

async function dequeue() {
  while (true) {
    let data = null;
    for (const p of PRIORITIES) {
      data = await redis.rpop(keyFor(p));
      if (data) break;
    }
    if (!data) return null;

    try {
      const job = JSON.parse(data);
      if (job.expiresAt && Date.now() > job.expiresAt) {
        incrementarDescartados();
        logger.warn("Job descartado por TTL expirado", {
          jobId: job.id,
          priority: job.priority,
          reason: "ttl_expired",
        });
        continue;
      }
      return job;
    } catch (e) {
      incrementarDescartados();
      logger.warn("Job inválido/corrompido descartado", { error: e.message });
      continue;
    }
  }
}

async function size() {
  return await totalSize();
}

async function quit() {
  await redis.quit();
}

module.exports = { enqueue, dequeue, size, quit };
