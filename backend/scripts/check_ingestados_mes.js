const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    try {
        const res = await c.query("SELECT DISTINCT to_char(mes, 'YYYY-MM') as month FROM stm_validaciones_ingestados ORDER BY month DESC");
        console.log("Months (mes column) in stm_validaciones_ingestados:", res.rows);
    } catch(e) {}
    
    await c.end();
}
check().catch(console.error);
