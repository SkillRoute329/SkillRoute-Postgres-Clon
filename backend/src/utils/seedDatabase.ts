import fs from 'fs';
import path from 'path';
import sqlDb from '../src/config/database';
import { v4 as uuidv4 } from 'uuid';
import logger from '../src/config/logger';

export async function seedDatabase(force = false) {
  try {
    const vehiculosCount = parseInt((await sqlDb('vehiculos').count<{ count: string }>({ count: '*' }).first())?.count || '0');
    
    if (vehiculosCount > 20 && !force) {
      logger.info('[SEED] Database already populated with real data, skipping seed.');
      return;
    }

    logger.info('[SEED] Seeding database with real UCOT data...');
    
    // Read the seed JSON
    const seedPath = path.join(__dirname, '../../data/initial_seed.json');
    if (!fs.existsSync(seedPath)) {
      logger.warn('[SEED] initial_seed.json not found, skipping seed.');
      return;
    }
    
    // Fetch the first agency ID or use a known one
    let agencyId = '70'; // Default to UCOT in schema_fase2.sql
    const firstUser = await sqlDb('users').select('agency_id').whereNotNull('agency_id').first();
    if (firstUser && firstUser.agency_id) {
      agencyId = firstUser.agency_id;
    }
    
    const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

    // Clear tables
    await sqlDb('turnos_dia').del();
    await sqlDb('solicitudes_listero').del();
    await sqlDb('alertas_operativas').del();
    await sqlDb('vehiculos').del();
    await sqlDb('personal').del();

    // Insert Vehiculos
    const vehiculosToInsert = seedData.vehiculos.map((v: any) => {
      // Determine type based on marca just to have some variety or default to diesel
      let tipo = 'diesel';
      if (v.marca?.toLowerCase().includes('yutong')) tipo = 'electrico';
      
      return {
        id: uuidv4(),
        agency_id: agencyId,
        internal_number: v.interno.toString(),
        plate: `ST-${v.interno}`, // Dummy plate for now
        data_jsonb: JSON.stringify({
          marca: v.marca,
          tipo,
          estadoHoy: 'disponible',
          motivoBaja: null
        })
      };
    });

    if (vehiculosToInsert.length > 0) {
      await sqlDb('vehiculos').insert(vehiculosToInsert);
      logger.info(`[SEED] Inserted ${vehiculosToInsert.length} vehicles.`);
    }

    // Insert Personal
    const personalToInsert = seedData.personal.map((p: any) => {
      // Map roles
      let role = 'admin';
      const cargo = (p.cargo || '').toLowerCase();
      if (cargo.includes('plataforma') || cargo.includes('maniobrista')) role = 'conductor';
      else if (cargo.includes('inspector') || cargo.includes('largador')) role = 'inspector';
      else if (cargo.includes('taller')) role = 'taller';
      
      return {
        id: uuidv4(),
        agency_id: agencyId,
        internal_number: p.interno.toString(),
        full_name: p.nombre,
        role: role,
        estado_hoy: 'disponible',
        telefono: p.telefono || null,
        es_conductor_reserva: false,
        regimen_rotacion: 'semanal',
        is_en_lista: true,
        patron_descanso: 'sab_dom_alterno',
        data_jsonb: JSON.stringify({ cargoOriginal: p.cargo })
      };
    });

    if (personalToInsert.length > 0) {
      await sqlDb('personal').insert(personalToInsert);
      logger.info(`[SEED] Inserted ${personalToInsert.length} personnel.`);
    }

    logger.info('[SEED] Database seeding complete.');
  } catch (error) {
    logger.error('[SEED] Error during seeding:', error);
  }
}

// Allow running directly from command line
if (require.main === module) {
  const force = process.argv.includes('--force');
  seedDatabase(force).then(() => {
    sqlDb.destroy();
    process.exit(0);
  });
}
