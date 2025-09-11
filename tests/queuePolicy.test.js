// Testes da Política de Fila: prioridades e TTL

// Configure env ANTES dos requires
process.env.QUEUE_MAX_SIZE = "2"; // força capacidade pequena para testar preempção

const Redis = require("ioredis");

// Importa após definir env
const queueService = require("../src/services/queueService");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Política de Fila: prioridades e TTL", () => {
  let adminRedis;

  beforeAll(() => {
    adminRedis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: process.env.REDIS_PORT || 6379,
    });
  });

  beforeEach(async () => {
    await adminRedis.flushall();
  });

  afterAll(async () => {
    await adminRedis.quit();
  });

  it("prioridade alta deve preemptar quando fila cheia", async () => {
    // Enfileira 2 jobs normais (capacidade total = 2)
    const j1 = await queueService.enqueue({ cpf: "111", priority: "normal" });
    const j2 = await queueService.enqueue({ cpf: "222", priority: "normal" });
    expect(await queueService.size()).toBe(2);

    // Enfileira 1 job high - deve remover um normal (preempção) e entrar
    const jHigh = await queueService.enqueue({ cpf: "333", priority: "high" });
    expect(jHigh && jHigh.id).toBeTruthy();
    expect(await queueService.size()).toBe(2);

    // Ao consumir, o primeiro deve ser o de prioridade alta
    const first = await queueService.dequeue();
    expect(first.priority).toBe("high");
    expect(first.id).toBe(jHigh.id);

    // O segundo deve ser um dos normais restantes
    const second = await queueService.dequeue();
    expect([j1.id, j2.id]).toContain(second.id);

    // Não deve haver mais jobs
    const none = await queueService.dequeue();
    expect(none).toBeNull();
  });

  it("job com TTL expirado deve ser descartado ao consumir", async () => {
    // Enfileira um job com TTL curtíssimo e outro normal
    const expiring = await queueService.enqueue(
      { cpf: "444", priority: "normal" },
      { ttlMs: 50 }
    );
    await sleep(60); // garante expiração
    const valid = await queueService.enqueue({ cpf: "555", priority: "normal" });

    // Ao consumir, o expirado é descartado e o válido é retornado
    const got = await queueService.dequeue();
    expect(got.id).toBe(valid.id);

    // Fila deve estar vazia depois de consumir o válido
    const none = await queueService.dequeue();
    expect(none).toBeNull();
  });
});

