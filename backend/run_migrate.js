const { execSync } = require('child_process');
require('dotenv').config();

try {
    console.log('Generating Prisma Client...');
    execSync('npx prisma generate', {
        env: { ...process.env },
        stdio: 'inherit'
    });
    console.log('Generation successful.');
} catch (error) {
    console.error('Generation failed:', error);
    process.exit(1);
}
