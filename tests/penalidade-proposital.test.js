// tests/penalidade-proposital.test.js
const axios = require("axios");
const request = require("supertest");
const app = require("../src/app");
const { gerarCPF } = require("../src/utils/gerarCpf");
const { fecharRecursos } = require("./helpers/teardown");

jest.setTimeout(20000); // aumenta timeout para cenários de carga

/**
 * Dispara N requisições paralelas para a URL informada.
 * @param {string} url - URL de destino
 * @param {number} quantidade - Quantidade de requisições
 * @param {boolean} viaProxy - Se true, usa o proxy local (supertest/app)
 * @returns {Promise<Array>} - Resultados das requisições
 */
async function dispararRequisicoes(url, quantidade, viaProxy = false) {
  const promises = [];
  for (let i = 0; i < quantidade; i++) {
    const cpf = gerarCPF();
    if (viaProxy) {
      promises.push(request(app).get(`/proxy/score?cpf=${cpf}`));
    } else {
      promises.push(
        axios.get(url, { params: { cpf }, validateStatus: () => true }) // não explode em erro
      );
    }
  }
  return Promise.all(promises);
}

describe("Penalidade proposital - upstream direto vs proxy", () => {
  const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://score.hsborges.dev/api/score";

  it("deve gerar penalidade ao chamar upstream diretamente em paralelo", async () => {
    const results = await dispararRequisicoes(UPSTREAM_URL, 5, false);

    // Esperado: várias respostas com erro (ex: 429 Too Many Requests)
    const penalidades = results.filter((r) => r.status >= 400);
    expect(penalidades.length).toBeGreaterThan(0);
  });

  it("com proxy ativo, mesma carga não deve gerar penalidade", async () => {
    const results = await dispararRequisicoes(UPSTREAM_URL, 5, true);

    // Esperado: proxy aceita requisições (202 Accepted)
    results.forEach((res) => {
      expect(res.status).toBe(202);
      expect(res.body).toHaveProperty("jobId");
    });
  });

  afterAll(async () => {
    await fecharRecursos();
  });
});
