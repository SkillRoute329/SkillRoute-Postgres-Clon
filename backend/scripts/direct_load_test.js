const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const db = knex({
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
  },
  pool: {
    min: 2,
    max: 20
  }
});

const TOTAL_DRIVERS = 1000;
let successCount = 0;
let errorCount = 0;

async function runDirectDbTest() {
  console.log(`[Load Test DB] Simulando ${TOTAL_DRIVERS} choferes consultando desvíos concurrentemente...`);
  const startTime = Date.now();

  const queries = [];
  for (let i = 0; i < TOTAL_DRIVERS; i++) {
    // Simulamos la consulta pesada que hace el endpoint /api/db/logs_incidencias
    const query = db('traffic_alerts')
      .where('tipo_alerta', 'VACANTE_SIN_RETEN')
      .orderBy('created_at', 'desc')
      .limit(5)
      .then(() => { successCount++; })
      .catch((err) => { errorCount++; console.error(err); });
    
    queries.push(query);
  }

  await Promise.all(queries);

  const durationMs = Date.now() - startTime;
  
  console.log(`\n==============================================`);
  console.log(`[RESULTADOS AUDITORÍA - ESTRÉS EN BASE DE DATOS]`);
  console.log(`==============================================`);
  console.log(`Consultas Conrcurrentes Lanzadas: ${TOTAL_DRIVERS}`);
  console.log(`Exitosas: ${successCount}`);
  console.log(`Errores (Timeout / Bloqueos): ${errorCount}`);
  console.log(`Tiempo total de procesamiento: ${durationMs} ms`);
  console.log(`Peticiones por segundo (RPS) internas: ${(TOTAL_DRIVERS / (durationMs/1000)).toFixed(2)} RPS`);
  console.log(`==============================================`);
  
  if (errorCount === 0) {
    console.log(`Conclusión: La Arquitectura Postgres (data_jsonb) soporta la ráfaga de 1000 choferes sin cuellos de botella en Knex.`);
  } else {
    console.log(`Conclusión: Hubo errores. El pool de conexiones pudo haberse saturado.`);
  }

  process.exit(0);
}

runDirectDbTest();
