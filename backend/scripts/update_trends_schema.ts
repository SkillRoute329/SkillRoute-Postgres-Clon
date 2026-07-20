import sqlDb from '../src/config/database';

async function run() {
  try {
    console.log('Actualizando esquema de stm_passenger_trends para estandar internacional...');
    await sqlDb.raw(`DROP TABLE IF EXISTS gtfs.stm_passenger_trends;`);
    
    await sqlDb.raw(`
      CREATE TABLE gtfs.stm_passenger_trends (
          route_id VARCHAR(50) NOT NULL,
          direction_id INT NOT NULL,
          month VARCHAR(7) NOT NULL,
          passenger_count BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (route_id, direction_id, month)
      );
    `);
    
    await sqlDb.raw(`CREATE INDEX idx_stm_passenger_trends_route_dir ON gtfs.stm_passenger_trends(route_id, direction_id);`);
    console.log('Esquema actualizado.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
