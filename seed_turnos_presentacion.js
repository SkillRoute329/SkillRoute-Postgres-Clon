const { Client } = require('./backend/node_modules/pg');
require('./backend/node_modules/dotenv').config({ path: './backend/.env' });

const c = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

async function seed() {
  await c.connect();
  const hoy = new Date().toISOString().split('T')[0];
  
  // Limpiar turnos de hoy por las dudas
  await c.query(`DELETE FROM roster_assignments`);
  
  // Insertar 5 turnos de prueba para la demostracion
  const query = `
    INSERT INTO roster_assignments (
      coche_id, driver_id, linea_id, hora_inicio, hora_fin, estado, jornal_equivalente
    ) VALUES 
      ('veh_1001', 'cond_001', '300', CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '7 hours', 'EN_CURSO', 45.50),
      ('veh_1002', 'cond_002', '316', CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '6 hours', 'EN_CURSO', 32.00),
      ('veh_1003', 'cond_003', '17', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '8 hours', 'PROGRAMADO', 15.00),
      ('veh_1004', 'cond_004', '76', CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '9 hours', 'PROGRAMADO', 50.00),
      ('veh_1005', 'cond_005', '192', CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '10 hours', 'PROGRAMADO', 28.00)
  `;
  await c.query(query);
  console.log('Se insertaron 5 turnos demo.');
  await c.end();
}

seed().catch(console.error);
