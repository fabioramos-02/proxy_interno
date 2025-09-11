# Guia de Estruturacao e Implementacao — Proxy Interno

## 1. Estrutura de Pastas Recomendada

```
proxy_interno/
  src/
    api/          # Rotas e controllers Express
    services/     # Logica de negocio (fila, scheduler, proxy)
    jobs/         # Workers/schedulers
    config/       # Configuracoes (env, Redis, Prisma)
    utils/        # Utilitarios gerais
    index.js      # Ponto de entrada do app
  prisma/         # Schema e migrations do Prisma
  tests/          # Testes automatizados
  docs/           # Documentacao extra
  .env            # Variaveis de ambiente
  package.json
  README.md
  docs/guia.md    # Este guia
```

## 2. Passos de Implementação

### 2.1. Inicialização do Projeto

```bash
npm init -y
npm install express redis swagger-ui-express prom-client prisma @prisma/client dotenv winston ioredis
npm install --save-dev nodemon jest supertest
npx prisma init
```

### 2.2. Configuração do Redis

- Crie `src/config/redis.js`:

```js
const Redis = require('ioredis');
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
});
module.exports = redis;
```

### 2.3. Estrutura do Express

- `src/index.js`: carrega middlewares, rotas, Swagger, Prometheus e inicia o servidor.

### 2.4. Implementação dos Componentes

- Fila: Use Redis para enfileirar requisições.
- Scheduler: Worker que consome a fila e faz proxy para a API externa, respeitando o rate limit.
- Proxy: Endpoint `/proxy/score` que coloca requisições na fila.
- Métricas: Endpoint `/metrics` usando `prom-client`.
- Healthcheck: Endpoint `/health`.
- Swagger: Documentação automática das rotas.

### 2.5. Boas Práticas

- Separe responsabilidades (controllers, services, middlewares).
- Use variáveis de ambiente para configs sensíveis.
- Implemente logs estruturados (Winston).
- Use padrão Singleton para Prisma e Redis.
- Escreva testes automatizados para endpoints e lógica de fila.

### 2.6. Exemplo de Organização de Código

- `src/api/proxy.js` — Controller do endpoint `/proxy/score`
- `src/services/queueService.js` — Lógica de enfileiramento
- `src/jobs/scheduler.js` — Worker que processa a fila
- `src/api/metrics.js` — Endpoint de métricas Prometheus
- `src/api/health.js` — Healthcheck

### 2.7. Testes

- Use Jest e Supertest para testar endpoints e lógica de negócio.

### 2.8. Documentação

- Mantenha o Swagger atualizado.
- Escreva README.md com instruções de uso, setup e exemplos.

---

## 3. Configuracao por Ambiente (.env)

Variaveis relevantes ao scheduler, rate limit e circuit breaker:

- UPSTREAM_URL: URL da API externa usada pelo scheduler (default: https://score.hsborges.dev/api/score)
- REQUEST_TIMEOUT_MS: timeout por chamada ao upstream em ms (default: 3000)
- BREAKER_FAILURE_THRESHOLD: falhas consecutivas para abrir o breaker (default: 3)
- BREAKER_OPEN_WINDOW_MS: janela com breaker aberto, evitando novas tentativas, em ms (default: 10000)
- SCHEDULER_INITIAL_INTERVAL_MS: intervalo inicial do scheduler em ms (default: 1000)
- QUEUE_MAX_SIZE: tamanho maximo da fila (default: 100)
- JOB_TTL_MS: TTL maximo (ms) que um job pode aguardar na fila antes de ser descartado (default: 10000)
- REDIS_HOST / REDIS_PORT: conexao do Redis

Exemplo no .env:

```
UPSTREAM_URL=https://score.hsborges.dev/api/score
REQUEST_TIMEOUT_MS=3000
BREAKER_FAILURE_THRESHOLD=3
BREAKER_OPEN_WINDOW_MS=10000
SCHEDULER_INITIAL_INTERVAL_MS=1000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
JOB_TTL_MS=10000
```

## 4. Observabilidade (RNF5)

Metricas Prometheus expostas em `/metrics` (principais):

- proxy_queue_size: tamanho atual da fila
- proxy_jobs_total{status}: total de jobs por status (processed, failed, dropped, fallback)
- proxy_job_latency_seconds: histograma de latencia do processamento
- proxy_penalties_avoided_total: contador de penalidades evitadas (via proxy)
- proxy_scheduler_interval_ms: gauge do intervalo atual do scheduler
- proxy_rate_limit_penalties_total: total de 429 detectados
- proxy_timeouts_total: total de timeouts ao chamar o upstream
- proxy_upstream_errors_total{code}: total de erros do upstream por codigo (5xx, etc.)
- proxy_fallbacks_total{motivo}: total de fallbacks (ex.: breaker_aberto, timeout, erro_5xx)
- proxy_circuit_state: estado do breaker (0=fechado, 0.5=meia-abertura, 1=aberto)
- proxy_circuit_open_total / proxy_circuit_close_total / proxy_circuit_half_open_total: transicoes do breaker

Logs (Winston) relevantes:

- [Scheduler] Ajustando cadencia: quando muda o intervalo do worker
- [Breaker] ABERTO / MEIA-ABERTURA / FECHADO: transicoes do circuit breaker
- [Breaker] Curto-circuito: quando evita chamadas durante a janela aberta
- [Scheduler] Job processado / Erro no job: sucesso e erros ao chamar o upstream
