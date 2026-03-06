const fs = require('fs');
const content =
  'DATABASE_URL="postgresql://user_admin:Agustin12345678@localhost:5432/transformafacil_db?schema=public"\n';
fs.writeFileSync('.env', content);
console.log('.env file written successfully');
