const { Client } = require('pg');

async function migrate() {
    const sourceClient = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    const targetClient = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');

    await sourceClient.connect();
    await targetClient.connect();

    console.log('Querying source...');
    // direction_id 0 and 1 since stm_demanda_mensual doesn't have direction, we will just split it evenly to mock the real world trends
    const query = `
        SELECT 
            dsc_linea as route_id, 
            to_char(mes, 'YYYY-MM') as month, 
            SUM(CAST(pasajeros AS bigint)) as total_passengers
        FROM public.stm_demanda_mensual
        WHERE dsc_linea IS NOT NULL
        GROUP BY dsc_linea, month
    `;
    const res = await sourceClient.query(query);
    console.log(`Found ${res.rows.length} rows.`);

    console.log('Truncating target...');
    await targetClient.query('TRUNCATE gtfs.stm_passenger_trends');

    console.log('Inserting into target...');
    let inserted = 0;
    for (const row of res.rows) {
        // Splitting evenly between direction 0 and 1
        const countIda = Math.floor(row.total_passengers / 2);
        const countVuelta = Math.ceil(row.total_passengers / 2);

        await targetClient.query(
            'INSERT INTO gtfs.stm_passenger_trends (route_id, direction_id, month, passenger_count) VALUES ($1, $2, $3, $4)',
            [row.route_id, 0, row.month, countIda]
        );
        await targetClient.query(
            'INSERT INTO gtfs.stm_passenger_trends (route_id, direction_id, month, passenger_count) VALUES ($1, $2, $3, $4)',
            [row.route_id, 1, row.month, countVuelta]
        );
        inserted += 2;
    }
    
    console.log(`Successfully migrated ${inserted} rows into gtfs.stm_passenger_trends!`);

    await sourceClient.end();
    await targetClient.end();
}

migrate().catch(console.error);
