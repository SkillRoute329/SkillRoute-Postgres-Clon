const knex = require('knex');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '../.env') });
const db = knex({ client: 'pg', connection: { connectionString: process.env.DATABASE_URL } });

const agencyMappingPath = path.join(__dirname, '../src/modules/gtfs-core/data/gtfs/agency_mapping.json');
const agencyMapping = JSON.parse(fs.readFileSync(agencyMappingPath, 'utf8'));

async function run() {
  try {
    const agencyId = '70';
    const validRoutes = Object.keys(agencyMapping).filter(route => String(agencyMapping[route]) === agencyId);
    
    const sharedLines = {
      '70': ['CE1', 'DM1'],
      '50': ['CE1', 'DM1']
    };
    if (sharedLines[String(agencyId)]) {
      for (const line of sharedLines[String(agencyId)]) {
        if (!validRoutes.includes(line)) validRoutes.push(line);
      }
    }
    
    console.log("Valid routes from mapping:", validRoutes);

    const routesList = validRoutes.map(r => `'${r}'`).join(', ');
    const query = `
      SELECT DISTINCT 
        r.route_short_name as codigo,
        r.route_long_name as nombre
      FROM gtfs.routes r
      WHERE r.route_short_name IN (${routesList})
      ORDER BY codigo ASC
    `;
    const res = await db.raw(query);
    console.table(res.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
run();
