import sqlDb from '../src/config/database';
async function run() {
  await sqlDb.schema.withSchema('gtfs').createTableIfNotExists('agency_routes', table => {
    table.string('agency_id', 50);
    table.string('route_short_name', 50);
    table.integer('detection_count').defaultTo(0);
    table.timestamp('last_seen_at').defaultTo(sqlDb.fn.now());
    table.primary(['agency_id', 'route_short_name']);
  });
  console.log('Table gtfs.agency_routes created.');
  process.exit(0);
}
run();
