const request = require("supertest");

// Configura variáveis de ambiente ANTES de importar os módulos
process.env.SCHEDULER_INITIAL_INTERVAL_MS = "50";
process.env.REQUEST_TIMEOUT_MS = "100";
process.env.BREAKER_FAILURE_THRESHOLD = "2";
process.env.BREAKER_OPEN_WINDOW_MS = "1000";

// Mock de axios para simular timeouts e 5xx
jest.mock("axios", () => ({
  get: jest.fn(),
}));

const axios = require("axios");

// Importa app e scheduler depois de configurar mocks/env
const app = require("../src/app");
const scheduler = require("../src/jobs/scheduler");
const queueService = require("../src/services/queueService");

// Ajuda: aguarda um tempo
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Circuit Breaker - timeouts e 5xx", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("abre com timeouts, evita chamadas na janela e fecha após sucesso", async () => {
    // 1) Prepara o axios: duas falhas por timeout e depois sucesso
    axios.get
      .mockRejectedValueOnce(Object.assign(new Error("timeout of 100ms exceeded"), { code: "ECONNABORTED" }))
      .mockRejectedValueOnce(Object.assign(new Error("timeout of 100ms exceeded"), { code: "ECONNABORTED" }))
      .mockResolvedValueOnce({ status: 200, data: { ok: true } });

    // 2) Enfileira 4 jobs
    for (let i = 0; i < 4; i++) {
      await queueService.enqueue({ cpf: "05227892180" });
    }

    // 3) Processa 3 vezes: duas falhas (abre breaker) + uma tentativa curta (curto-circuito)
    await scheduler.processQueue(); // timeout 1
    await scheduler.processQueue(); // timeout 2 -> abre breaker
    const metricsAfterOpen = await request(app).get("/metrics").set("Accept", "text/plain");
    expect(metricsAfterOpen.status).toBe(200);
    expect(metricsAfterOpen.text).toContain("proxy_circuit_open_total");

    // Tenta processar enquanto aberto: deve curto-circuitar (sem chamar axios)
    const beforeCalls = axios.get.mock.calls.length;
    await scheduler.processQueue();
    const afterCalls = axios.get.mock.calls.length;
    expect(afterCalls).toBe(beforeCalls); // sem novas chamadas

    const metricsShort = await request(app).get("/metrics").set("Accept", "text/plain");
    expect(metricsShort.text).toContain("proxy_short_circuits_total");
    expect(metricsShort.text).toContain("proxy_fallbacks_total");

    // 4) Aguarda janela do breaker expirar e fecha após sucesso
    await sleep(parseInt(process.env.BREAKER_OPEN_WINDOW_MS) + 50);
    await scheduler.processQueue(); // meia-abertura -> sucesso -> fecha

    const metricsClosed = await request(app).get("/metrics").set("Accept", "text/plain");
    expect(metricsClosed.text).toContain("proxy_circuit_close_total");
  });

  it("abre com 5xx e evita novas tentativas na janela", async () => {
    axios.get
      .mockRejectedValueOnce({ response: { status: 500 }, message: "Internal Error" })
      .mockRejectedValueOnce({ response: { status: 502 }, message: "Bad Gateway" });

    // Enfileira e processa até abrir
    await queueService.enqueue({ cpf: "05227892180" });
    await queueService.enqueue({ cpf: "05227892180" });
    await scheduler.processQueue();
    await scheduler.processQueue();

    const metricsOpen = await request(app).get("/metrics").set("Accept", "text/plain");
    expect(metricsOpen.text).toContain("proxy_circuit_open_total");
    expect(metricsOpen.text).toContain("proxy_upstream_errors_total");

    // Durante a janela: mais um job deve curto-circuitar
    await queueService.enqueue({ cpf: "05227892180" });
    const before = axios.get.mock.calls.length;
    await scheduler.processQueue();
    const after = axios.get.mock.calls.length;
    expect(after).toBe(before);
  });
});
