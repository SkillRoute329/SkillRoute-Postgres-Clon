const { Client } = require('pg');
const c = new Client('postgresql://postgres:I0SAv9zhoQDUfTPc7L+KmkAw@localhost:5432/skillroute_master');
c.connect().then(() => c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'"))
  .then(r => { console.log(r.rows); process.exit(); })
  .catch(e => { console.error(e); process.exit(1); });
