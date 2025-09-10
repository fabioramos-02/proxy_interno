const request = require("supertest");
const app = require("../src/app"); // agora importa só o app

describe("Burst Test - 20 requisições em 1s", () => {
  it("deve enfileirar 20 requisições rapidamente e manter throughput de 1/s", async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(request(app).get(`/proxy/score?cpf=05227892180`));
    }
    /**
     * Aguarda a resolução de todas as promises e armazena os resultados em um array.
     * @type {Array<any>} results - Array contendo os resultados de cada promise.
     */
    const results = await Promise.all(promises);

    results.forEach((res) => {
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("jobId");
    });

    const elapsed = (Date.now() - start) / 1000;
    expect(elapsed).toBeLessThan(2);
  });
});
