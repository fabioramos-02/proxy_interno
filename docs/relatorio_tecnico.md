# Relatório Técnico (Curto)

## Padrões adotados e rejeitados
- Adotados:
  - Fila em Redis com prioridades e TTL: controla backpressure e justiça relativa.
  - Circuit Breaker (fechado/meia‑abertura/aberto) e timeout no upstream: resiliência e proteção.
  - Logs estruturados (Winston) e métricas (prom-client): observabilidade (RNF5).
  - Separação de camadas (API/services/jobs/utils) e configuração via .env (12‑factor).
- Rejeitados (com justificativa):
  - Chamada síncrona direta ao upstream: não respeita rate limit e amplifica picos.
  - Re-tentativas automáticas agressivas: aumentam pressão e latência; preferimos fila + breaker.
  - Uma única fila sem prioridade: não atende cenários onde atualizações são mais críticas que consultas.

## Experimentos de carga
- Metodologia:
  - Ferramenta: autocannon/k6 (ou JMeter), executando contra `/proxy/score`.
  - Cenários:
    - Burst: 20 req em 1s (uma vez) — mede tempo de enfileiramento e 202 imediatos.
    - Sustentado: 50 req em 10s — avalia estabilidade e ausência de 5xx.
    - Falhas do upstream: simulação de 5xx/timeout — avalia abertura/fechamento do breaker.
  - Métricas observadas:
    - `proxy_queue_size`, `proxy_jobs_total{status}`, `proxy_job_latency_seconds{quantiles}`
    - `proxy_circuit_state` e transições, `proxy_timeouts_total`, `proxy_upstream_errors_total{code}`
  - Dashboards (Grafana):
    - Painel de fila (tamanho, drops, accepted)
    - Painel de latência (p50/p90/p95/p99 usando histogram)
    - Painel de breaker (estado e contadores)
- Gráficos (sugestão):
  - Linha de `proxy_queue_size` durante burst e sustentado.
  - Barras/linhas para `proxy_jobs_total` por status.
  - Heatmap/histograma de `proxy_job_latency_seconds`.

## Análise crítica (trade-offs)
- Latência x Throughput:
  - A resposta 202 rápida reduz a latência percebida, mas a latência ponta‑a‑ponta depende do tempo de espera na fila.
  - O throughput do upstream é mantido em 1 req/s; picos são amortecidos.
- Justiça da fila x Experiência do cliente:
  - Prioridades permitem que operações críticas passem à frente, mas podem aumentar a espera das requisições de baixa prioridade.
  - TTL descarta pedidos “velhos”, evitando respostas inúteis, mas pode frustar clientes sob alta carga.
- Resiliência x Freshness:
  - Breaker aberto evita tempestades de erro e preserva o sistema, porém temporariamente evita novas tentativas.
  - Fallback (e.g., cache/counted) melhora UX sob falha, mas pode retornar dados menos atuais.

## Próximos passos
- Introduzir cache de respostas recentes (with TTL separado) para melhorar experiência sob breaker aberto.
- Ajustar dinamicamente o intervalo do scheduler com base em penalidades recentes (controle adaptativo).
- Expandir testes de carga automatizados e incluir geração de gráficos no CI.
