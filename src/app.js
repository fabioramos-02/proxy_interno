const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./config/swagger.json');
const { proxyScore } = require('./api/proxy');
const { metricas } = require('./api/metrics');
const { health } = require('./api/health');

const app = express();

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/proxy/score', proxyScore);
app.get('/metrics', metricas);
app.get('/health', health);

app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

module.exports = app;
