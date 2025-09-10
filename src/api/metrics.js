const client = require('prom-client');

// Crie métricas customizadas conforme sua necessidade
const queueSizeGauge = new client.Gauge({
  name: 'proxy_queue_size',
  help: 'Tamanho atual da fila de requisições'
});

// Exemplo: atualize o valor do gauge em algum lugar do seu código
function updateQueueSize(size) {
  queueSizeGauge.set(size);
}

// Endpoint para expor as métricas
async function metrics(req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

module.exports = { metrics, updateQueueSize };