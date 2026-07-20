const { Client } = require('pg');
const copyTo = require('pg-copy-streams').to;
const copyFrom = require('pg-copy-streams').from;
const { pipeline } = require('stream/promises');

async function migrate() {
    const sourceClient = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    const targetClient = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');

    await sourceClient.connect();
    await targetClient.connect();

    const tables = [
        'gtfs.agency',
        'gtfs.calendar',
        'gtfs.calendar_dates',
        'gtfs.routes',
        'gtfs.stops',
        'gtfs.shapes',
        'gtfs.trips',
        'gtfs.stop_times',
        'gtfs.stm_passenger_trends'
    ];

    for (const table of tables) {
        console.log(`Migrando tabla ${table}...`);
        
        try {
            await targetClient.query(`TRUNCATE ${table} CASCADE`);
        } catch (e) {
            console.log(`Nota: Fallo al truncar ${table}, puede no existir o no tener foreign keys.`);
        }

        try {
            const streamFrom = sourceClient.query(copyTo(`COPY ${table} TO STDOUT`));
            const streamTo = targetClient.query(copyFrom(`COPY ${table} FROM STDIN`));

            await pipeline(streamFrom, streamTo);
            console.log(`✅ ${table} migrada exitosamente.`);
        } catch (err) {
            console.error(`❌ Error migrando ${table}:`, err.message);
        }
    }

    await sourceClient.end();
    await targetClient.end();
    console.log('Migración completada!');
}

migrate().catch(console.error);
