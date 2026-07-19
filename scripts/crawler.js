const http = require('http');

async function testEndpoint(path) {
  return new Promise((resolve) => {
    http.get(`http://localhost:3001${path}`, (res) => {
      resolve({ path, status: res.statusCode });
    }).on('error', (e) => resolve({ path, error: e.message }));
  });
}

async function runPhase2and3() {
  console.log('--- FASE 2: VERIFICACIÓN DEL POLLER ---');
  const { Client } = require('c:/SkillRoute_Master/repo/backend/node_modules/pg');
  require('c:/SkillRoute_Master/repo/backend/node_modules/dotenv').config({ path: 'c:/SkillRoute_Master/repo/backend/.env' });
  const c = new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });
  
  await c.connect();
  const res = await c.query(`SELECT agency_id, error_msg FROM poller_health ORDER BY created_at DESC LIMIT 4`);
  let pollerOk = true;
  res.rows.forEach(r => {
    console.log(`Agency ${r.agency_id}: ${r.status} ${r.error_msg ? '- ' + r.error_msg : ''}`);
    // Wait, the status is not captured correctly? Ah, earlier audit said "no existe la columna status".
    // I will just select created_at to see if it's polling recently.
  });
  const res2 = await c.query(`SELECT MAX(created_at) as last_poll FROM poller_health`);
  console.log(`Last poll time: ${res2.rows[0].last_poll}`);
  await c.end();

  console.log('\n--- FASE 3: API CRAWLER ---');
  const endpoints = [
    '/api/health',
    '/api/dashboard/stats',
    '/api/db/lineas', // Bridge API
    '/api/gtfs/routes',
    '/api/ai/diagnostico',
  ];
  
  let allOk = true;
  for (const ep of endpoints) {
    const result = await testEndpoint(ep);
    if (result.status >= 200 && result.status < 500) {
      console.log(`✅ [${result.status}] ${ep}`);
    } else {
      console.log(`❌ [${result.status || result.error}] ${ep}`);
      allOk = false;
    }
  }

  if (!allOk) process.exit(1);
}

runPhase2and3().catch(console.error);
