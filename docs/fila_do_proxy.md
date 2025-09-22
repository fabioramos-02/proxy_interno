# Fila do Proxy — Como Funciona

Este documento explica, de forma simples e direta, como a fila do proxy organiza e processa as requisições.

## Visão Geral
- O proxy não chama a API externa diretamente para cada requisição recebida.
- Em vez disso, ele enfileira “jobs” em Redis e um scheduler (worker) consome a fila em cadência controlada.
- Isso ajuda a respeitar rate limits do provedor externo e dá espaço para aplicar políticas (prioridade, TTL, fallback).

## Estrutura da Fila (com Prioridades)
- São usadas três filas, uma para cada prioridade:
  - `proxy_queue:high`
  - `proxy_queue:normal`
  - `proxy_queue:low`
- O consumo segue SEMPRE a ordem: high → normal → low.
- A capacidade total é controlada por `QUEUE_MAX_SIZE` (soma dos três níveis).

## Como um Job entra na Fila
1. O endpoint `/proxy/score` valida os parâmetros e enfileira o job (por padrão, prioridade “normal”).
2. O serviço de fila grava o job com metadados:
   - `id`, `params`, `priority`, `createdAt`, `expiresAt` (TTL).
3. O TTL padrão é definido por `JOB_TTL_MS` (ms). Jobs que esperarem mais que isso são descartados.

Observação: hoje o endpoint público só aceita `cpf`, então as requisições entram como prioridade “normal”. A infraestrutura, porém, já suporta prioridades; produtores internos podem enfileirar com `priority=high|normal|low` ou `type=update|…` diretamente via `queueService.enqueue()`.

## Política de Prioridade e Preempção
- Se a fila estiver cheia:
  - Job “high”: remove (descarta) primeiro de `low`, senão de `normal` para abrir espaço.
  - Job “normal”: remove (descarta) de `low` para abrir espaço.
  - Job “low”: não remove ninguém; o novo job é descartado.
- Todo descarte registra métrica e log estruturado (motivo e prioridade) e incrementa `proxy_jobs_total{status="dropped"}`.

## TTL (Time To Live)
- Cada job recebe `expiresAt` ao ser enfileirado.
- No consumo, se o job estiver expirado, ele é descartado com motivo `ttl_expired` e o próximo é avaliado.
- Valor padrão: `JOB_TTL_MS` (ms, configurável via `.env`).

## Como um Job sai da Fila
- O scheduler executa periodicamente e processa 1 job por “tick”.
- Ordem de busca: high → normal → low.
- A chamada ao upstream tem timeout (`REQUEST_TIMEOUT_MS`) e está protegida por um circuit breaker.
- Em caso de sucesso: contabiliza latência, status `processed` e pode ajustar a cadência.
- Em caso de erro/timeout: contabiliza `failed` e as métricas de erro; o breaker pode abrir para evitar novas tentativas.

## Métricas Relevantes
- `proxy_queue_size`: tamanho total da fila (somando prioridades).
- `proxy_jobs_total{status}`: contagem por status (processed, failed, dropped, fallback).
- `proxy_fallbacks_total{motivo}`: fallbacks/evitações (ex.: breaker_aberto, timeout, erro_5xx).
- `proxy_timeouts_total`, `proxy_upstream_errors_total{code}`, `proxy_rate_limit_penalties_total`.
- `proxy_circuit_state` e transições: `proxy_circuit_open_total`, `proxy_circuit_close_total`, `proxy_circuit_half_open_total`.

## Configuração (.env)
- `QUEUE_MAX_SIZE`: capacidade total da fila (default: 100)
- `JOB_TTL_MS`: TTL do job na fila, em ms (default: 10000)
- `UPSTREAM_URL`: URL da API externa
- `REQUEST_TIMEOUT_MS`: timeout de cada chamada ao upstream
- `BREAKER_FAILURE_THRESHOLD`, `BREAKER_OPEN_WINDOW_MS`, `SCHEDULER_INITIAL_INTERVAL_MS`: controles do scheduler/breaker

## Exemplos
- Requisição padrão (prioridade “normal”):
  - `GET /proxy/score?cpf=05227892180` → retorna `202` com `jobId` ao enfileirar.
- Produção interna (via código) com prioridade alta:
  ```js
  const { enqueue } = require('../src/services/queueService');
  await enqueue({ cpf: '05227892180', priority: 'high' });
  // ou: await enqueue({ cpf: '05227892180', type: 'update' });
  ```

## Cache de Respostas Recentes

Além da fila, o proxy também utiliza **caching** em Redis para evitar chamadas repetidas ao upstream:

- Cada resultado da API de score é armazenado com chave `cache:score:{cpf}` e TTL configurável (`CACHE_TTL_SEC`, default: 60s).
- Antes de enviar uma chamada ao upstream, o scheduler consulta o cache:
  - **Hit:** se o CPF já tem resultado recente, ele é retornado imediatamente sem chamar o upstream.
  - **Miss:** se não existe no cache, a chamada é feita normalmente e o resultado armazenado.
- Em caso de falha no upstream (timeout, breaker aberto, erro 5xx), o cache também pode ser usado como **fallback**.

### Benefícios do cache
- Reduz requisições redundantes ao provedor externo.
- Minimiza penalidades por violar rate limit.
- Melhora a latência percebida pelos clientes internos.
- Aumenta a resiliência em cenários de indisponibilidade temporária.

### Variáveis de ambiente relacionadas
- `CACHE_TTL_SEC`: tempo de vida de cada entrada de cache em segundos (default: 60).
- `REDIS_HOST` e `REDIS_PORT`: já utilizados para fila, também são usados para o cache.

### Exemplo de uso prático
1. Cliente A requisita `GET /proxy/score?cpf=05227892180`.  
   → Resposta vem do upstream e é salva em cache.  
2. Cliente B faz a mesma requisição logo em seguida.  
   → Resposta vem do **cache**, sem custo para o upstream.
