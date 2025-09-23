// tests/circuitBreaker.test.js
const request = require("supertest");

// Configura variáveis de ambiente ANTES de importar os módulos
process.env.SCHEDULER_INITIAL_INTERVAL_MS = "50";
process.env.REQUEST_TIMEOUT_MS = "100";
process.env.BREAKER_FAILURE_THRESHOLD = "2";
process.env.BREAKER_OPEN_WINDOW_MS = "1000";
process.env.DISABLE_CACHE = "true"; // 👈 garante que o cache não interfere

// Mock de axios para simular timeouts e 5xx
jest.mock("axios", () => ({
  get: jest.fn(),
}));

const axios = require("axios");

// Importa app e serviços depois das env
const app = require("../src/app");
const scheduler = require("../src/jobs/scheduler");
const queueService = require("../src/services/queueService");
const { gerarCPF } = require("../src/utils/gerarCpf");

// Utilitário de espera
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("Circuit Breaker - timeouts e 5xx", () => {
  jest.setTimeout(20000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("abre com timeouts, evita chamadas na janela e fecha após sucesso", async () => {
    // Simula: 2 falhas (timeout) → depois sucesso
    axios.get
      .mockRejectedValueOnce(
        Object.assign(new Error("timeout of 100ms exceeded"), {
          code: "ECONNABORTED",
        })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("timeout of 100ms exceeded"), {
          code: "ECONNABORTED",
        })
      )
      .mockResolvedValueOnce({ status: 200, data: { ok: true } });

    // Enfileira jobs
    for (let i = 0; i < 4; i++) {
      await queueService.enqueue({ cpf: gerarCPF() });
    }

    await scheduler.processQueue(); // falha 1
    await scheduler.processQueue(); // falha 2 → abre breaker

    const metricsAfterOpen = await request(app)
      .get("/metrics")
      .set("Accept", "text/plain");
    expect(metricsAfterOpen.text).toMatch(/proxy_circuit_open_total\s+[0-9]+/);

    // Durante janela → não chama axios
    const before = axios.get.mock.calls.length;
    await scheduler.processQueue();
    const after = axios.get.mock.calls.length;
    expect(after).toBe(before);

    const metricsShort = await request(app)
      .get("/metrics")
      .set("Accept", "text/plain");
    expect(metricsShort.text).toMatch(/proxy_short_circuits_total\s+[0-9]+/);

    // Aguarda janela expirar
    await sleep(parseInt(process.env.BREAKER_OPEN_WINDOW_MS) + 50);
    await scheduler.processQueue(); // meia-abertura → sucesso → fecha

    const metricsClosed = await request(app)
      .get("/metrics")
      .set("Accept", "text/plain");
    expect(metricsClosed.text).toMatch(/proxy_circuit_close_total\s+[0-9]+/);
  });

  it("abre com 5xx e evita novas tentativas na janela", async () => {
    // Simula erros 500
    axios.get
      .mockRejectedValueOnce({
        response: { status: 500 },
        message: "Internal Error",
      })
      .mockRejectedValueOnce({
        response: { status: 502 },
        message: "Bad Gateway",
      });

    // Enfileira jobs e processa até abrir o breaker
    await queueService.enqueue({ cpf: gerarCPF() });
    await queueService.enqueue({ cpf: gerarCPF() });
    await scheduler.processQueue(); // erro 500
    await scheduler.processQueue(); // erro 502 → abre breaker

    // Confirma que o breaker abriu
    const metricsOpen = await request(app)
      .get("/metrics")
      .set("Accept", "text/plain");
    expect(metricsOpen.text).toMatch(/proxy_circuit_open_total\s+[0-9]+/);
    expect(metricsOpen.text).toMatch(/proxy_upstream_errors_total/);

    // 🔹 Limpa a fila antes de medir
    while (await queueService.dequeue()) {}

    // Agora mede chamadas axios antes de tentar novo processamento
    const before = axios.get.mock.calls.length;

    // Enfileira novo job, mas breaker ainda aberto → deve curto-circuitar
    await queueService.enqueue({ cpf: gerarCPF() });
    await scheduler.processQueue();

    const after = axios.get.mock.calls.length;
    expect(after).toBe(before); // não houve novas chamadas
  });
  afterAll(async () => {
    scheduler.stop(); // encerra timers
    await queueService.quit(); // fecha Redis
  });
});
