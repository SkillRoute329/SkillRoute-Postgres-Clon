
require('dotenv').config();
const { execSync } = require('child_process');

console.log('Loaded DATABASE_URL:', process.env.DATABASE_URL ? 'YES' : 'NO');
// Print masked URL for debugging
if (process.env.DATABASE_URL) {
    console.log('DB Host:', process.env.DATABASE_URL.split('@')[1]);
}

try {
    execSync('npx prisma migrate dev --name add_system_config', { stdio: 'inherit' });
} catch (error) {
    console.error('Migration failed');
    process.exit(1);
}
