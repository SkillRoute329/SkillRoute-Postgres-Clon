import sqlDb from '../src/config/database';
import fs from 'fs';
import path from 'path';

async function run() {
  const dataPath = path.join(__dirname, '../../frontend/src/data/shapesAllOperators.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const entries: any[] = [];
  
  Object.values(data).forEach((entry: any) => {
    if (entry.agencyId && entry.linea) {
      entries.push({
        agency_id: entry.agencyId,
        route_short_name: entry.linea,
        detection_count: 9999
      });
    }
  });

  // Deduplicate
  const unique = Array.from(new Set(entries.map(e => JSON.stringify(e)))).map(e => JSON.parse(e));

  for (const row of unique) {
    await sqlDb('gtfs.agency_routes')
      .insert(row)
      .onConflict(['agency_id', 'route_short_name'])
      .merge();
  }

  console.log(`Seeded ${unique.length} routes.`);
  process.exit(0);
}
run();
