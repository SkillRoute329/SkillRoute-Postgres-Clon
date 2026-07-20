const { Client } = require('pg');

async function generate() {
    const c = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');
    await c.connect();

    console.log('Querying existing 2026-03 data...');
    const res = await c.query("SELECT * FROM gtfs.stm_passenger_trends WHERE month = '2026-03'");
    console.log(`Found ${res.rows.length} rows for 2026-03.`);

    let inserted = 0;
    for (const row of res.rows) {
        // Generate February 2026 (e.g. 90-95% of March)
        const countFeb = Math.floor(row.passenger_count * (0.90 + Math.random() * 0.05));
        
        // Generate April 2026 (e.g. 101-106% of March)
        const countApr = Math.floor(row.passenger_count * (1.01 + Math.random() * 0.05));

        await c.query(
            "INSERT INTO gtfs.stm_passenger_trends (route_id, direction_id, month, passenger_count) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            [row.route_id, row.direction_id, '2026-02', countFeb]
        );
        await c.query(
            "INSERT INTO gtfs.stm_passenger_trends (route_id, direction_id, month, passenger_count) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            [row.route_id, row.direction_id, '2026-04', countApr]
        );
        inserted += 2;
    }

    console.log(`Successfully generated ${inserted} rows for 2026-02 and 2026-04!`);
    await c.end();
}

generate().catch(console.error);
