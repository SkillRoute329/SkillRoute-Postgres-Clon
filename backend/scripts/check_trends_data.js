const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5433/skillroute_soberano');
    await c.connect();
    const res = await c.query("SELECT DISTINCT month FROM gtfs.stm_passenger_trends");
    console.log(res.rows);
    await c.end();
}
check().catch(console.error);
