// tests/politica-de-fila.test.js
const Redis = require("ioredis");
const queueService = require("../src/services/queueService");
const { gerarCPF } = require("../src/utils/gerarCpf");
const { fecharRecursos } = require("./helpers/teardown");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Política de Fila - prioridades e TTL", () => {
  let adminRedis;

  beforeAll(() => {
    // Garante que a fila usada nos testes seja pequena → força cenários de preempção
    process.env.QUEUE_MAX_SIZE = process.env.QUEUE_MAX_SIZE || "2";

    adminRedis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: process.env.REDIS_PORT || 6379,
    });
  });

  beforeEach(async () => {
    await adminRedis.flushall(); // limpa Redis entre testes
  });

  afterAll(async () => {
    await adminRedis.quit();
    await fecharRecursos(); // encerra queueService, scheduler, métricas etc.
  });

  it("prioridade alta deve preemptar normal/low quando fila cheia", async () => {
    const j1 = await queueService.enqueue({
      cpf: gerarCPF(),
      priority: "normal",
    });
    const j2 = await queueService.enqueue({
      cpf: gerarCPF(),
      priority: "normal",
    });
    expect(await queueService.size()).toBe(Number(process.env.QUEUE_MAX_SIZE));

    const jHigh = await queueService.enqueue({
      cpf: gerarCPF(),
      priority: "high",
    });
    expect(jHigh && jHigh.id).toBeTruthy();

    // ✅ garante que a fila nunca ultrapassou o limite
    console.log(await queueService.size());
    expect(await queueService.size()).toBe(Number(process.env.QUEUE_MAX_SIZE));

    // O primeiro a sair precisa ser o high (preemptou os normais)
    const first = await queueService.dequeue();
    expect(first.priority).toBe("high");

    // O segundo precisa ser um dos normais (sobrou só 1 após a preempção)
    const second = await queueService.dequeue();
    expect([j1.id, j2.id]).toContain(second.id);

    // O outro normal foi preemptado e removido → a fila agora deve estar vazia
    const none = await queueService.dequeue();
    expect(none).toBeNull();

    // 🚀 Extra: garante que o ID descartado não está mais presente
    const survivingIds = [first?.id, second?.id].filter(Boolean);
    expect(survivingIds).toContain(jHigh.id); // high sobreviveu
    expect(survivingIds).not.toEqual(expect.arrayContaining([j1.id, j2.id])); // 1 dos normais foi eliminado
  });

  it("jobs com TTL expirado devem ser descartados ao consumir", async () => {
    await queueService.enqueue(
      { cpf: gerarCPF(), priority: "normal" },
      { ttlMs: 50 }
    );
    await sleep(60);

    const valid = await queueService.enqueue({
      cpf: gerarCPF(),
      priority: "normal",
    });

    const got = await queueService.dequeue();
    expect(got.id).toBe(valid.id);

    const none = await queueService.dequeue();
    expect(none).toBeNull();
  });

  it("tipo=update deve ser resolvido como prioridade high", async () => {
    const job = await queueService.enqueue({ cpf: gerarCPF(), type: "update" });
    expect(job.priority).toBe("high");
  });

  it("tipo=low deve ser resolvido como prioridade baixa", async () => {
    const job = await queueService.enqueue({ cpf: gerarCPF(), type: "low" });
    expect(job.priority).toBe("low");
  });
});
