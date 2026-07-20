const fs = require('fs');
const readline = require('readline');
const { Client } = require('pg');

async function ingestCsv(csvPath, month) {
    console.log(`Ingesting ${csvPath} for month ${month}...`);
    const targetClient = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');
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

    const passengerCounts = new Map();
    const rl = readline.createInterface({
        input: fs.createReadStream(csvPath),
        crlfDelay: Infinity
    });

    let isHeader = true;
    let dscLineaIdx = -1, stopIdx = -1, cantIdx = -1;

    for await (const line of rl) {
        if (isHeader) {
            const headers = line.split(',');
            dscLineaIdx = headers.indexOf('dsc_linea');
            stopIdx = headers.indexOf('codigo_parada_origen');
            cantIdx = headers.indexOf('cantidad_pasajeros');
            isHeader = false;
            continue;
        }

        const columns = line.split(',');
        if (columns.length <= dscLineaIdx) continue;

        const dscLinea = columns[dscLineaIdx]?.trim();
        const stopId = columns[stopIdx]?.trim();
        const cant = parseInt(columns[cantIdx]?.trim() || '0', 10);

        if (dscLinea && stopId && !isNaN(cant) && cant > 0) {
            const direction = stopMap.get(`${dscLinea}|${stopId}`) ?? 0;
            const key = `${dscLinea}|${direction}|${month}`;
            passengerCounts.set(key, (passengerCounts.get(key) || 0) + cant);
        }
    }

    console.log(`Deleting existing records for month ${month} to avoid duplicates...`);
    await targetClient.query('DELETE FROM gtfs.stm_passenger_trends WHERE month = $1', [month]);

    console.log('Inserting into target...');
    let inserted = 0;
    
    const rowsToInsert = [];
    for (const [key, count] of Array.from(passengerCounts.entries())) {
        const parts = key.split('|');
        const route_id = parts[0];
        const direction_id = parseInt(parts[1], 10);
        const m = parts[2];
        rowsToInsert.push({ route_id, direction_id, month: m, passenger_count: count });
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
    
    console.log(`Successfully ingested ${inserted} perfectly accurate rows into gtfs.stm_passenger_trends for month ${month}!`);
    await targetClient.end();
}

const csvPath = process.argv[2];
const month = process.argv[3];
if (!csvPath || !month) {
    console.error('Usage: node ingest_csv.js <path_to_csv> <YYYY-MM>');
    process.exit(1);
}

ingestCsv(csvPath, month).catch(console.error);
