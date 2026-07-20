const { Client } = require('pg');
async function check() {
    const c = new Client('postgres://postgres:Skill329@localhost:5432/skillroute_master');
    await c.connect();
    
    // check stm_boletaje_5g columns
    const resB = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stm_boletaje_5g'");
    console.log('stm_boletaje_5g columns:', resB.rows);

    // check stm_demanda_mensual columns
    const resD = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'stm_demanda_mensual'");
    console.log('stm_demanda_mensual columns:', resD.rows);

    // Any other table with 'stm' and 'mensual' or 'demanda' or 'pasajero'
    const resAll = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND (table_name LIKE '%mensual%' OR table_name LIKE '%pasajero%' OR table_name LIKE '%demanda%' OR table_name LIKE '%boleto%')");
    console.log('Other potential tables:', resAll.rows);

    await c.end();
}
check().catch(console.error);
