// tests/helpers/teardown.js
const queueService = require("../../src/services/queueService");
const scheduler = require("../../src/jobs/scheduler");
const client = require("prom-client");

async function fecharRecursos() {
  // encerra timers
  scheduler.stop();

  // encerra redis
  await queueService.quit();

  // limpa métricas e timers do prom-client
  client.register.clear();
  if (client.collectDefaultMetrics?.clear) {
    client.collectDefaultMetrics.clear();
  }

  // garante que asyncs terminem
  await new Promise((res) => setTimeout(res, 30));
}

module.exports = { fecharRecursos };
