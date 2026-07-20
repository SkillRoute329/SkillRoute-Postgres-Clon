const { Client } = require('pg');

async function migrate() {
    const sourceClient = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    const targetClient = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');

    await sourceClient.connect();
    await targetClient.connect();

    console.log('Fetching direction mapping from GTFS in soberano...');
    const stopMap = new Map();
    const rows = await targetClient.query(`
      SELECT r.route_short_name, st.stop_id, t.direction_id
      FROM gtfs.routes r
      JOIN gtfs.trips t ON r.route_id = t.route_id
      JOIN gtfs.stop_times st ON t.trip_id = st.trip_id
      GROUP BY r.route_short_name, st.stop_id, t.direction_id
    `);
    
    for (const row of rows.rows) {
        stopMap.set(`${row.route_short_name}|${row.stop_id}`, row.direction_id);
    }
    console.log(`Loaded ${stopMap.size} stop mappings from GTFS.`);

    console.log('Querying raw validaciones from master...');
    const query = `
        SELECT 
            dsc_linea as route_id, 
            codigo_parada as stop_id,
            to_char(mes, 'YYYY-MM') as month, 
            SUM(validaciones) as count
        FROM public.stm_validaciones_mensual
        WHERE dsc_linea IS NOT NULL AND codigo_parada IS NOT NULL
        GROUP BY dsc_linea, codigo_parada, month
    `;
    const res = await sourceClient.query(query);
    console.log(`Found ${res.rows.length} grouped records in master.`);

    // Map-reduce
    const passengerCounts = new Map();
    for (const row of res.rows) {
        const direction = stopMap.get(`${row.route_id}|${row.stop_id}`) ?? 0;
        const key = `${row.route_id}|${direction}|${row.month}`;
        const val = parseInt(row.count, 10);
        passengerCounts.set(key, (passengerCounts.get(key) || 0) + val);
    }

    console.log('Truncating target gtfs.stm_passenger_trends...');
    await targetClient.query('TRUNCATE gtfs.stm_passenger_trends');

    console.log('Inserting into target...');
    let inserted = 0;
    
    const rowsToInsert = [];
    for (const [key, count] of Array.from(passengerCounts.entries())) {
        const parts = key.split('|');
        const route_id = parts[0];
        const direction_id = parseInt(parts[1], 10);
        const month = parts[2];
        rowsToInsert.push({ route_id, direction_id, month, passenger_count: count });
    }

    const chunkSize = 1000;
    for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
        const chunk = rowsToInsert.slice(i, i + chunkSize);
        
        let valuesStr = [];
        let params = [];
        let paramIdx = 1;
        
        for (const c of chunk) {
            valuesStr.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
            params.push(c.route_id, c.direction_id, c.month, c.passenger_count);
        }
        
        await targetClient.query(
            `INSERT INTO gtfs.stm_passenger_trends (route_id, direction_id, month, passenger_count) VALUES ${valuesStr.join(',')} ON CONFLICT DO NOTHING`,
            params
        );
        inserted += chunk.length;
    }
    
    console.log(`Successfully migrated ${inserted} perfectly accurate rows into gtfs.stm_passenger_trends!`);

    await sourceClient.end();
    await targetClient.end();
}

migrate().catch(console.error);
