const axios = require("axios");
const request = require("supertest");
const app = require("../src/app");

const UPSTREAM_URL = process.env.UPSTREAM_URL ||
  "https://score.hsborges.dev/api/score";

describe("Teste de Penalidade Proposital", () => {
  jest.setTimeout(20000);

  it("deve mostrar penalidade em chamadas diretas e evitá-la via proxy", async () => {
    const cpf = "05227892180";

    // 🔹 1. Chamadas diretas ao upstream (paralelas → gera 429)
    const directCalls = await Promise.allSettled([
      axios.get(UPSTREAM_URL, {
        params: { cpf },
        headers: { "client-id": "1", accept: "application/json" },
      }),
      axios.get(UPSTREAM_URL, {
        params: { cpf },
        headers: { "client-id": "1", accept: "application/json" },
      }),
    ]);

    const directStatuses = directCalls.map((r) =>
      r.status === "fulfilled" ? r.value.status : r.reason.response?.status
    );

    expect(directStatuses).toContain(429); // pelo menos 1 penalidade

    // 🔹 2. Chamadas via proxy → devem entrar na fila
    const proxyCalls = await Promise.all([
      request(app).get(`/proxy/score?cpf=${cpf}`),
      request(app).get(`/proxy/score?cpf=${cpf}`),
    ]);

    proxyCalls.forEach((res) => {
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("jobId");
    });
  });

  it("deve expor métricas de penalidades evitadas", async () => {
    const res = await request(app).get("/metrics").set("Accept", "text/plain");

    expect(res.status).toBe(200);
    expect(res.text).toContain("proxy_penalties_avoided_total");
  });
});
