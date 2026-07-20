const { Client } = require('pg');
const c = new Client({ host: 'localhost', port: 5432, database: 'skillroute_master', user: 'postgres', password: 'I0SAv9zhoQDUfTPc7L+KmkAw' });
c.connect().then(() => {
  return c.query("SELECT data_jsonb->>'password' as pw FROM users WHERE id='329'");
}).then(r => {
  console.log(r.rows);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
