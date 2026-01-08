const fs = require('fs');
const content = 'DATABASE_URL="postgresql://user_admin:Agustin12345678@localhost:5555/transformafacil_db?schema=public"\n';
fs.writeFileSync('.env', content);
console.log('.env updated to port 5555');
