const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    // Check all tables containing 'stm'
    const res = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%stm%'");
    console.log("Tables:", res.rows);
    
    // Check distinct months in stm_demanda_mensual
    try {
        const res2 = await c.query("SELECT DISTINCT to_char(mes, 'YYYY-MM') as month FROM stm_demanda_mensual");
        console.log("Months in stm_demanda_mensual:", res2.rows);
    } catch(e) { console.error(e.message); }

    await c.end();
}
check().catch(console.error);
