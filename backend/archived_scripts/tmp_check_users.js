const { Client } = require('pg');
const c = new Client({ connectionString: 'postgres://postgres:Skill329@localhost:5433/skillroute_soberano' });
c.connect().then(() => {
  return c.query("SELECT id, role, email, data_jsonb->>'password' as pw FROM users LIMIT 10");
}).then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
