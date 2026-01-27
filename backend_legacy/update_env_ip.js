const fs = require('fs');
const content = 'DATABASE_URL="postgresql://user_admin:Agustin12345678@127.0.0.1:5555/transformafacil_db?schema=public"\n';
fs.writeFileSync('.env', content);
console.log('.env updated to 127.0.0.1:5555');
