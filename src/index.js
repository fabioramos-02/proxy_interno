require('dotenv').config();
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');
const { proxyScore } = require('./api/proxy');
const { metrics } = require('./api/metrics');
const { health } = require('./api/health');
// ...outros requires...

const app = express();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/proxy/score', proxyScore);
app.get('/metrics', metrics);
app.get('/health', health);
// ...outras rotas...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`Servidor rodando na porta ${PORT}\nEndereço: http://localhost:${PORT}`);
console.log('Documentação da API disponível em: http://localhost:3000/api-docs');
});


// Rota raiz redireciona para a documentação
app.get('/', (req, res) => {
    res.redirect('/api-docs');
});

module.exports = {
  QUEUE_MAX_SIZE: parseInt(process.env.QUEUE_MAX_SIZE) || 100,
  RETRY_LIMIT: parseInt(process.env.RETRY_LIMIT) || 3,
  TIMEOUT_MS: parseInt(process.env.TIMEOUT_MS) || 5000,
  CIRCUIT_BREAKER_THRESHOLD: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD) || 5
};