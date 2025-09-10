# 🛡️ Desafio — Proxy Interno

📚 **Trabalho de TADS — Engenharia de Software**  
🎓 **Universidade Federal de Mato Grosso do Sul (UFMS)**  
👨‍🎓 Acadêmico: **Fábio Ramos**

---

## 📌 Contexto

Este projeto consiste em criar um **proxy interno** para consumir a API pública  
[`https://score.hsborges.dev/docs`](https://score.hsborges.dev/docs).  

O proxy deve lidar com **rate limiting** imposto pelo provedor externo:

- ⏱️ **Rate limit externo:** 1 requisição por segundo.  
- ⚠️ **Penalidade:** +2 segundos ao violar o limite.  
- 🎯 **Objetivo:** lidar com picos internos, **minimizar penalidades** e **expor métricas**.  
- 📑 **Swagger**: utilizado para **documentar e testar os endpoints**.

---

## ✅ Requisitos Funcionais

- `GET /proxy/score` → encaminhar requisições.  
- `GET /metrics` → expor métricas de uso.  
- `GET /health` → healthcheck (liveness/readiness).  

---

## ⚙️ Requisitos Não Funcionais

- Suportar rajadas de até **20 req/s**.  
- Evitar penalidades recorrentes.  
- Throughput próximo de **1 req/s estável**.  
- Logs, métricas e dashboards para monitoramento.  

---

## 🏗️ Arquitetura

- **Proxy Service** com fila interna (backpressure).  
- **Scheduler** garante emissão máxima de **1 req/s**.  
- **Políticas de fila**: FIFO, prioridade, TTL.  
- **Fallback**: cache, shed load.  
- **Observabilidade**: métricas, logs estruturados e dashboards.  

---

## 📊 Estrutura do Sistema

```mermaid
flowchart LR
    subgraph Empresa [Ambiente Interno]
        C1[Cliente Interno 1]
        C2[Cliente Interno 2]
        CN[Cliente Interno N]
    end

    subgraph Proxy["Proxy Service"]
        Fila[Buffer / Fila]
        Scheduler[Scheduler / RateLimiter]
        Metrics[Métricas & Health]
        DB[(Prisma DB)]
    end

    API[API Externa<br>score.hsborges.dev]

    C1 --> Fila
    C2 --> Fila
    CN --> Fila

    Fila --> Scheduler
    Scheduler --> API

    Proxy --> Metrics
    Proxy --> DB
