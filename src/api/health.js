// src/api/health.js

async function health(req, res) {
  // Aqui você pode adicionar verificações extras (DB, Redis, etc)
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
}

module.exports = { health };
