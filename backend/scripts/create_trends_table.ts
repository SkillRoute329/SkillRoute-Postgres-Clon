import sqlDb from '../src/config/database';

async function createTable() {
  try {
    console.log('Creando tabla gtfs.stm_passenger_trends...');
    await sqlDb.raw(`
      CREATE TABLE IF NOT EXISTS gtfs.stm_passenger_trends (
          route_id VARCHAR(50) NOT NULL,
          month VARCHAR(7) NOT NULL,
          passenger_count BIGINT NOT NULL DEFAULT 0,
          PRIMARY KEY (route_id, month)
      );
    `);
    
    // Add indexes for fast lookup
    await sqlDb.raw(`CREATE INDEX IF NOT EXISTS idx_stm_passenger_trends_route_id ON gtfs.stm_passenger_trends(route_id);`);
    await sqlDb.raw(`CREATE INDEX IF NOT EXISTS idx_stm_passenger_trends_month ON gtfs.stm_passenger_trends(month);`);
    
    console.log('Tabla y los índices creados exitosamente.');
  } catch (error) {
    console.error('Error creando tabla:', error);
  } finally {
    process.exit(0);
  }
}

createTable();
