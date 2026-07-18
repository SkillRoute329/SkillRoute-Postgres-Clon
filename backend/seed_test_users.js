const { Client } = require('pg');
require('dotenv').config({ path: '../backend/.env' }); // load from backend

async function run() {
  const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/skillroute_master';
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Conectado a Postgres para sembrar usuarios (Multitenant + IMM)...');

    const insertEmpresas = `
      INSERT INTO empresas (id, agency_id, nombre) VALUES (99, 99, 'IMM Regulador') ON CONFLICT (id) DO NOTHING;
    `;
    await client.query(insertEmpresas);

    const users = [
      { id: '100', full_name: 'Admin COETC', email: 'admin@coetc.uy', role: 'ADMIN', agency_id: 10, password: 'SkillUser!' },
      { id: '200', full_name: 'Admin COME', email: 'admin@come.uy', role: 'ADMIN', agency_id: 20, password: 'SkillUser!' },
      { id: '500', full_name: 'Admin CUTCSA', email: 'admin@cutcsa.uy', role: 'SUPERADMIN', agency_id: 50, password: 'SkillUser!' },
      { id: '329', full_name: 'Jonathan UCOT', email: '329@ucot.uy', role: 'SUPERADMIN', agency_id: 70, password: 'Skill329' },
      { id: '999', full_name: 'Auditor IMM', email: 'auditoria@imm.gub.uy', role: 'REGULADOR', agency_id: 99, password: 'SkillUser!' }
    ];

    for (const u of users) {
      const q = `
        INSERT INTO users (id, full_name, email, role, agency_id, data_jsonb, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          role = EXCLUDED.role,
          agency_id = EXCLUDED.agency_id,
          data_jsonb = EXCLUDED.data_jsonb;
      `;
      const values = [u.id, u.full_name, u.email, u.role, u.agency_id, JSON.stringify({ password: u.password })];
      await client.query(q, values);
      console.log(`- Sembrado/Actualizado: ${u.full_name} (Rol: ${u.role}, Agencia: ${u.agency_id})`);
    }

    console.log('¡Semilla completada exitosamente!');
  } catch (err) {
    console.error('Error al sembrar:', err);
  } finally {
    await client.end();
  }
}

run();
