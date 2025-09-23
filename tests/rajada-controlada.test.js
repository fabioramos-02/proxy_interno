const request = require("supertest");
const app = require("../src/app");
const { gerarCPF } = require("../src/utils/gerarCpf");
const { fecharRecursos } = require("./helpers/teardown");

describe("Rajada controlada - 20 requisições em 1s", () => {
  it("deve enfileirar 20 requisições rapidamente e manter throughput de 1/s", async () => {
    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 20; i++) {
      promises.push(request(app).get(`/proxy/score?cpf=${gerarCPF()}`));
    }

    const results = await Promise.all(promises);

    results.forEach((res) => {
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("jobId");
    });

    const elapsed = (Date.now() - start) / 1000;
    expect(elapsed).toBeLessThan(2);
  });

  afterAll(async () => {
    await fecharRecursos(); // 👈 padronizado
  });
});
