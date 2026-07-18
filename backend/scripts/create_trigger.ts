import sqlDb from '../src/config/database';

async function run() {
  const triggerSql = `
    CREATE OR REPLACE FUNCTION gtfs.trg_update_agency_routes()
    RETURNS TRIGGER AS $$
    BEGIN
      IF NEW.linea IS NOT NULL AND NEW.linea <> '' AND NEW.agency_id IS NOT NULL THEN
        INSERT INTO gtfs.agency_routes (agency_id, route_short_name, detection_count, last_seen_at)
        VALUES (NEW.agency_id, NEW.linea, 1, NEW.created_at)
        ON CONFLICT (agency_id, route_short_name)
        DO UPDATE SET 
          detection_count = gtfs.agency_routes.detection_count + 1,
          last_seen_at = EXCLUDED.last_seen_at;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER IF EXISTS trg_vehicle_events_agency_routes ON vehicle_events;
    CREATE TRIGGER trg_vehicle_events_agency_routes
    AFTER INSERT ON vehicle_events
    FOR EACH ROW
    EXECUTE FUNCTION gtfs.trg_update_agency_routes();
  `;

  try {
    await sqlDb.raw(triggerSql);
    console.log('Trigger installed successfully.');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
