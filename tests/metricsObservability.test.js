// Testes de Observabilidade das métricas

// Configurar env antes dos requires
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_INITIAL_INTERVAL_MS = '50';
process.env.REQUEST_TIMEOUT_MS = '100';
process.env.BREAKER_FAILURE_THRESHOLD = '1';
process.env.BREAKER_OPEN_WINDOW_MS = '500';
process.env.QUEUE_MAX_SIZE = '1';

jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');

const request = require('supertest');
const Redis = require('ioredis');
const app = require('../src/app');
const queueService = require('../src/services/queueService');
const scheduler = require('../src/jobs/scheduler');
const metrics = require('../src/api/metrics');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('Observabilidade - métricas principais', () => {
  let adminRedis;

  beforeAll(() => {
    adminRedis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await adminRedis.flushall();
  });

  afterAll(async () => {
    await adminRedis.quit();
  });

  it('reflete enfileiramento (accepted), tamanho da fila, latência e drops', async () => {
    // 1) Enfileira 1 job (aceito)
    await queueService.enqueue({ cpf: '05227892180', priority: 'normal' });

    // Atualiza gauge de tamanho explicitamente e consulta métricas
    metrics.atualizarTamanhoFila(await queueService.size());
    let res = await request(app).get('/metrics').set('Accept', 'text/plain');
    expect(res.status).toBe(200);
    expect(res.text).toContain('proxy_queue_size');
    expect(res.text).toContain('proxy_jobs_total{status="accepted"}');

    // 2) Força fila cheia e tenta enfileirar outro (dropped por policy)
    const dropped = await queueService.enqueue({ cpf: '05227892180', priority: 'low' });
    expect(dropped.status).toBe('DROPPED');
    metrics.atualizarTamanhoFila(await queueService.size());
    res = await request(app).get('/metrics').set('Accept', 'text/plain');
    expect(res.text).toContain('proxy_jobs_total{status="dropped"}');

    // 3) Processa o job pendente com sucesso para registrar latência
    axios.get.mockResolvedValueOnce({ status: 200, data: { ok: true } });
    await scheduler.processQueue();
    res = await request(app).get('/metrics').set('Accept', 'text/plain');
    expect(res.text).toContain('proxy_job_latency_seconds_count');
    expect(res.text).toContain('proxy_jobs_total{status="processed"}');
  });

  it('reflete status do circuito e contagem de quedas por política (fallbacks)', async () => {
    // Enfileira um job
    await queueService.enqueue({ cpf: '05227892180', priority: 'normal' });

    // 1) Causa timeout/falha para abrir o breaker na primeira tentativa
    axios.get.mockRejectedValueOnce(Object.assign(new Error('timeout of 100ms exceeded'), { code: 'ECONNABORTED' }));
    await scheduler.processQueue();

    // 2) Enfileira outro e verifica curto-circuito (sem chamar axios)
    await queueService.enqueue({ cpf: '05227892180', priority: 'normal' });
    const before = axios.get.mock.calls.length;
    await scheduler.processQueue();
    const after = axios.get.mock.calls.length;
    expect(after).toBe(before);

    const res = await request(app).get('/metrics').set('Accept', 'text/plain');
    expect(res.status).toBe(200);
    expect(res.text).toContain('proxy_circuit_open_total');
    expect(res.text).toContain('proxy_circuit_state');
    expect(res.text).toContain('proxy_fallbacks_total');
  });
});
