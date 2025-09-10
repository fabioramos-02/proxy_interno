const queueService = require('../services/queueService');

// GET /proxy/score
async function proxyScore(req, res) {
  try {
    // Parâmetros recebidos na query string
    const params = req.query;

    // Enfileira a requisição (pode incluir usuário, prioridade, etc)
    const job = await queueService.enqueue(params);

    // Retorna um status de aceito e um id para acompanhamento (padrão async)
    res.status(202).json({ message: 'Requisição enfileirada', jobId: job.id });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enfileirar requisição', details: err.message });
  }
}

module.exports = { proxyScore };