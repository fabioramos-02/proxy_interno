# Guia de Estruturação e Implementação — Proxy Interno

## 1. Estrutura de Pastas Recomendada

```
proxy_interno/
│
├── src/
│   ├── api/              # Rotas e controllers Express
│   ├── services/         # Lógica de negócio (fila, scheduler, proxy)
│   ├── middlewares/      # Middlewares Express (logs, erros, etc)
│   ├── jobs/             # Workers/schedulers
│   ├── config/           # Configurações (env, Redis, Prisma)
│   ├── utils/            # Utilitários gerais
│   └── index.js          # Ponto de entrada do app
│
├── prisma/               # Schema e migrations do Prisma
│
├── tests/                # Testes automatizados
│
├── docs/                 # Documentação extra
│
├── .env                  # Variáveis de ambiente
├── package.json
├── README.md
└── guia.md               # Este guia
```

## 2. Passos de Implementação

### 2.1. Inicialização do Projeto

```bash
npm init -y
npm install express redis swagger-ui-express prom-client prisma @prisma/client dotenv winston
npm install --save-dev nodemon jest supertest
npx prisma init
```

### 2.2. Configuração do Prisma (Singleton)

- Crie `src/config/prisma.js`:

```js
const { PrismaClient } = require('@prisma/client');
let prisma;

function getPrisma() {
  if (!prisma) {
    prisma = new PrismaClient();
  }
  return prisma;
}

module.exports = getPrisma;
```

### 2.3. Configuração do Redis

- Crie `src/config/redis.js`:

```js
const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);
module.exports = redis;
```

### 2.4. Estrutura do Express

- `src/index.js`:
  - Carrega middlewares, rotas, Swagger, Prometheus e inicia o servidor.

### 2.5. Implementação dos Componentes

- **Fila:** Use Redis para enfileirar requisições.
- **Scheduler:** Worker que consome a fila e faz proxy para a API externa, respeitando o rate limit.
- **Proxy:** Endpoint `/proxy/score` que coloca requisições na fila.
- **Métricas:** Endpoint `/metrics` usando `prom-client`.
- **Healthcheck:** Endpoint `/health`.
- **Swagger:** Documentação automática das rotas.

### 2.6. Boas Práticas

- Separe responsabilidades (controllers, services, middlewares).
- Use variáveis de ambiente para configs sensíveis.
- Implemente logs estruturados (Winston).
- Use padrão Singleton para Prisma e Redis.
- Escreva testes automatizados para endpoints e lógica de fila.

### 2.7. Exemplo de Organização de Código

- `src/api/proxy.js` — Controller do endpoint `/proxy/score`
- `src/services/queueService.js` — Lógica de enfileiramento
- `src/jobs/scheduler.js` — Worker que processa a fila
- `src/api/metrics.js` — Endpoint de métricas Prometheus
- `src/api/health.js` — Healthcheck

### 2.8. Testes

- Use Jest e Supertest para testar endpoints e lógica de negócio.

### 2.9. Documentação

- Mantenha o Swagger atualizado.
- Escreva README.md com instruções de uso, setup e exemplos.

---

Siga este guia para manter o projeto organizado, escalável e fácil de manter.
