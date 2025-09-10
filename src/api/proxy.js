// src/api/proxy.js
const queueService = require("../services/queueService");

async function proxyScore(req, res) {
  try {
    // Filtra apenas parâmetros aceitos pela API externa
    const allowedParams = ['cpf'];
    const params = {};
    for (const key of allowedParams) {
      if (req.query[key]) params[key] = req.query[key];
    }

    // Se não passar cpf, pode retornar erro 400 do próprio proxy
    if (!params.cpf) {
      return res.status(400).json({ error: "Parâmetro 'cpf' é obrigatório" });
    }

    const job = await queueService.enqueue(params);
    if (job.status === "DROPPED") {
      return res.status(503).json(job);
    }

    res.status(202).json({ message: "Requisição enfileirada", jobId: job.id });
  } catch (err) {
    res.status(500).json({ error: "Erro ao enfileirar requisição", details: err.message });
  }
}

module.exports = { proxyScore };
