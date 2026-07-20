const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stm_validaciones_ingestados'");
    console.log(res.rows);

    try {
        const res2 = await c.query("SELECT DISTINCT to_char(mes, 'YYYY-MM') as month FROM stm_validaciones_ingestados");
        console.log("Months:", res2.rows);
    } catch(e) {}
    
    await c.end();
}
check().catch(console.error);
