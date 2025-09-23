// tests/observabilidade.test.js
const request = require("supertest");
const app = require("../src/app");
const { gerarCPF } = require("../src/utils/gerarCpf");
const { fecharRecursos } = require("./helpers/teardown");
const metrics = require("../src/api/metrics");
const { register } = require("prom-client"); // 👈 importa o registry global

describe("Observabilidade - métricas expostas", () => {
  beforeEach(() => {
    register.resetMetrics(); // 👈 garante métricas limpas a cada teste
  });

  it("deve expor métricas básicas no formato Prometheus", async () => {
    const res = await request(app).get("/metrics");
    expect(res.status).toBe(200);
    expect(res.text).toContain("proxy_queue_size");
    expect(res.text).toContain("proxy_jobs_total");
  });

  it("deve refletir incrementos em jobs aceitos", async () => {
    const before = await request(app).get("/metrics");
    const countBefore = parseInt(
      (before.text.match(/proxy_jobs_total\{status="accepted"\} (\d+)/) || [])[1] || "0"
    );

    await request(app).get(`/proxy/score?cpf=${gerarCPF()}`);

    const after = await request(app).get("/metrics");
    const countAfter = parseInt(
      (after.text.match(/proxy_jobs_total\{status="accepted"\} (\d+)/) || [])[1] || "0"
    );

    expect(countAfter).toBeGreaterThan(countBefore);
  });

  it("deve refletir descartes na fila cheia", async () => {
  process.env.QUEUE_MAX_SIZE = "1";
  jest.resetModules();
  const queueService = require("../src/services/queueService");

  await queueService.enqueue({ cpf: gerarCPF(), priority: "normal" });
  await queueService.enqueue({ cpf: gerarCPF(), priority: "normal" }); // deve ser descartado

  // 🔑 força flush para garantir atualização do registro
  const res = await request(app).get("/metrics");

  // Debug opcional
  console.log(res.text);

  expect(res.text).toMatch(/proxy_jobs_total\{status="dropped"\}\s+[1-9]\d*/);
});
  it("deve atualizar estado do circuito", async () => {
    metrics.setEstadoCircuito("aberto");

    const res = await request(app).get("/metrics");
    expect(res.text).toContain("proxy_circuit_state 1");
  });

  afterAll(async () => {
    await fecharRecursos();
  });
});
