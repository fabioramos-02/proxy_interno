// src/api/proxy.js
const queueService = require('../services/queueService');
const { incPenaltiesAvoided } = require('./metrics');

async function proxyScore(req, res) {
  try {
    // aceita apenas cpf
    const params = {};
    if (req.query.cpf) params.cpf = req.query.cpf;
    if (!params.cpf) {
      return res.status(400).json({ error: "Parâmetro 'cpf' é obrigatório" });
    }

    const job = await queueService.enqueue(params);
    if (job.status === 'DROPPED') {
      return res.status(503).json(job);
    }

    // registra penalidade evitada
    incPenaltiesAvoided();

    return res.status(202).json({ message: 'Requisição enfileirada', jobId: job.id });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao enfileirar requisição', details: err.message });
  }
}

module.exports = { proxyScore };
