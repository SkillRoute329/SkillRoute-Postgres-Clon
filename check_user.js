const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://postgres:Skill329@localhost:5432/skillroute_master' });
c.connect().then(() => {
  return c.query("SELECT id, role, email, full_name, data_jsonb FROM users WHERE id = '329' OR email LIKE '%329%'");
}).then(r => {
  console.dir(r.rows, {depth: null});
  process.exit(0);
}).catch(e => console.error(e));
