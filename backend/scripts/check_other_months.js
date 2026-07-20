const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    try {
        const res = await c.query("SELECT DISTINCT to_char(fecha_operacion, 'YYYY-MM') as month FROM stm_estadisticas_diarias ORDER BY month DESC LIMIT 10");
        console.log("Months in stm_estadisticas_diarias:", res.rows);
    } catch(e) {}

    try {
        const res = await c.query("SELECT DISTINCT to_char(ingested_at, 'YYYY-MM') as month FROM stm_validaciones_ingestados");
        console.log("Months in stm_validaciones_ingestados:", res.rows);
    } catch(e) {}

    await c.end();
}
check().catch(console.error);
