const { Client } = require('pg');
const c = new Client('postgresql://postgres:I0SAv9zhoQDUfTPc7L+KmkAw@localhost:5432/skillroute_master');

async function main() {
  await c.connect();
  const res = await c.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='rotation_rules'");
  console.log('Columns:', res.rows);
  
  const rules = await c.query("SELECT * FROM rotation_rules LIMIT 5");
  console.log('Sample rows:', rules.rows);
  
  await c.end();
}

main().catch(console.error);
