const { Client } = require('pg');
async function check() {
    const dbs = ['skillroute_master', 'skillroute_soberano'];
    const ports = [5432, 5433];
    
    for (let i = 0; i < 2; i++) {
        const client = new Client(`postgres://postgres:Skill329@localhost:${ports[i]}/${dbs[i]}`);
        await client.connect();
        const res = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%trend%' OR table_name LIKE '%stm%' OR table_name LIKE '%passenger%'");
        console.log(`DB ${dbs[i]} en ${ports[i]}:`, res.rows);
        await client.end();
    }
}
check().catch(console.error);
