// src/api/proxy.js
const queueService = require("../services/queueService");
const { incPenaltiesAvoided } = require("./metrics");

async function proxyScore(req, res) {
  try {
    // Filtra apenas parâmetros aceitos pela API externa
    const allowedParams = ["cpf"];
    const params = {};
    for (const key of allowedParams) {
      if (req.query[key]) params[key] = req.query[key];
    }

    // Se não passar CPF → erro 400 no proxy
    if (!params.cpf) {
      return res
        .status(400)
        .json({ error: "Parâmetro 'cpf' é obrigatório" });
    }

    const job = await queueService.enqueue(params);

    if (job.status === "DROPPED") {
      return res.status(503).json(job);
    }

    // 🔹 Proxy aceitou → conta como penalidade evitada
    incPenaltiesAvoided();

    return res
      .status(202)
      .json({ message: "Requisição enfileirada", jobId: job.id });
  } catch (err) {
    return res.status(500).json({
      error: "Erro ao enfileirar requisição",
      details: err.message
    });
  }
}

module.exports = { proxyScore };
