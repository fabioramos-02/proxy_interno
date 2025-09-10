const app = require('./app');
const { PORT } = require('./config');

require('./jobs/scheduler');

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}\nEndereço: http://localhost:${PORT}`);
  console.log('Documentação da API disponível em: http://localhost:3000/api-docs');
});
