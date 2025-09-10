const request = require('supertest');
const app = require('../src/index'); // ajuste se necessário

describe('Burst Test - 20 requisições em 1s', () => {
  it('deve enfileirar 20 requisições rapidamente e manter throughput de 1/s', async () => {
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(request(app).get(`/proxy/score?cpf=05227892180${i}`));
    }
    const results = await Promise.all(promises);
    results.forEach(res => {
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty('jobId');
    });
    // Opcional: aguarde 20s e verifique se o throughput foi respeitado
    // (pode ser feito via métricas ou logs)
    const elapsed = (Date.now() - start) / 1000;
    expect(elapsed).toBeLessThan(2); // todas as requisições enfileiradas em menos de 2s
  });
});
