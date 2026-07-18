import sqlDb from '../src/config/database';

async function verifyAllAgencies() {
  const agencies = [
    { id: '10', name: 'COETC' },
    { id: '20', name: 'COME' },
    { id: '50', name: 'CUTCSA' },
    { id: '70', name: 'UCOT' }
  ];

  console.log('=== INICIANDO VERIFICACIÓN MULTI-TENANT DE LÍNEAS ===');
  
  for (const agency of agencies) {
    try {
      const query = `
        SELECT DISTINCT 
          r.route_short_name as codigo,
          r.route_long_name as nombre
        FROM gtfs.routes r
        JOIN gtfs.agency_routes ar ON r.route_short_name = ar.route_short_name
        WHERE ar.agency_id = ? AND ar.detection_count >= 50
        ORDER BY codigo ASC
      `;
      const raw = await sqlDb.raw(query, [agency.id]);
      const lines = raw.rows || raw;
      const lineCodes = lines.map((l: any) => l.codigo);
      console.log(`\nOperador: ${agency.name} (Agency ID: ${agency.id})`);
      console.log(`Total líneas encontradas: ${lineCodes.length}`);
      console.log(`Líneas: ${lineCodes.join(', ')}`);
    } catch (e) {
      console.error(`Error verificando ${agency.name}:`, e);
    }
  }
  
  console.log('\n=== VERIFICACIÓN COMPLETADA ===');
  process.exit(0);
}

verifyAllAgencies();
