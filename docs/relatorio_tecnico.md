# Relatório Técnico (Curto)

## Padrões adotados e rejeitados
- **Adotados:**
  - **Proxy Pattern:** o serviço inteiro funciona como um proxy interno, interceptando chamadas internas e repassando de forma controlada ao upstream.
  - **Fila em Redis (Producer-Consumer):** garante backpressure e justiça relativa, com suporte a prioridades (high/normal/low) e TTL por job.
  - **Circuit Breaker Pattern:** implementado no scheduler, com estados fechado, aberto e meia-abertura, além de timeout configurável no upstream.
  - **Cache-aside Pattern:** respostas de score são armazenadas em Redis por CPF, com TTL configurável; evita chamadas repetidas e serve como fallback em caso de falha no upstream.
  - **Logs estruturados e métricas (observabilidade):** Winston (logs JSON) e prom-client (métricas Prometheus).
  - **Separação de camadas e configuração 12-factor:** API (controllers), services (fila/cache), jobs (scheduler), utils (logger), e variáveis de ambiente via `.env`.

- **Rejeitados (com justificativa):**
  - **Chamada síncrona direta ao upstream:** não respeita o rate limit e amplifica picos.
  - **Re-tentativas agressivas:** aumentariam pressão e latência; preferimos fila + breaker para controle adaptativo.
  - **Fila única sem prioridade:** não atende cenários onde atualizações são mais críticas que consultas.

---

## Experimentos de carga
- **Metodologia:**
  - Ferramenta: autocannon/k6 (ou JMeter), executando contra `/proxy/score`.
  - Cenários avaliados:
    - **Burst:** 20 requisições em 1s → proxy respondeu todas com `202` imediato; upstream recebeu ~1 req/s sem penalidades.
    - **Sustentado:** 50 requisições em 10s → estabilidade mantida, sem 5xx.
    - **Falhas do upstream:** simulação de erros 5xx/timeout → breaker abriu após limiar, evitou tempestade de erros e fechou após janela configurada.
    - **Cache:** requisições repetidas para o mesmo CPF → servidas diretamente do cache Redis (latência reduzida, zero chamadas extras ao upstream).

- **Métricas observadas:**
  - `proxy_queue_size`
  - `proxy_jobs_total{status}`
  - `proxy_job_latency_seconds{quantiles}`
  - `proxy_circuit_state` e transições
  - `proxy_timeouts_total`
  - `proxy_upstream_errors_total{code}`
  - `proxy_cache_hits_total` e `proxy_cache_misses_total`



## Análise crítica (trade-offs)
- **Latência x Throughput:**
  - O retorno `202 Accepted` imediato garante baixa latência para o cliente.
  - A latência ponta-a-ponta depende do tempo de espera na fila, mas o throughput sustentado é mantido em 1 req/s.
- **Justiça da fila x Experiência do cliente:**
  - Prioridades permitem que operações críticas passem à frente.
  - TTL descarta jobs vencidos, evitando respostas inúteis, mas pode frustrar clientes em cenários de sobrecarga.
- **Resiliência x Freshness:**
  - O breaker protege o upstream em falhas persistentes, mas atrasa novas tentativas.
  - O cache melhora a experiência em falhas ou repetição de consultas, mas pode servir dados ligeiramente defasados.
- **Observabilidade x Simplicidade:**
  - Métricas e logs detalhados ajudam em auditoria, mas aumentam a complexidade operacional.

---
