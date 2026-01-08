const fs = require('fs');
const content = 'DATABASE_URL="postgresql://user_admin:password_admin@127.0.0.1:5555/transformafacil_db?schema=public"\n';
fs.writeFileSync('.env', content);
console.log('.env updated with password_admin');
