const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    try {
        const res = await c.query("SELECT DISTINCT to_char(mes, 'YYYY-MM') as month FROM stm_validaciones_mensual");
        console.log("Months in stm_validaciones_mensual:", res.rows);
    } catch(e) { console.error("stm_validaciones_mensual error:", e.message); }

    try {
        const res = await c.query("SELECT DISTINCT to_char(fecha, 'YYYY-MM') as month FROM stm_boletaje_5g");
        console.log("Months in stm_boletaje_5g:", res.rows);
    } catch(e) { console.error("stm_boletaje_5g error:", e.message); }
    
    await c.end();
}
check().catch(console.error);
