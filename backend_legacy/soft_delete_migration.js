
const { Client } = require('pg');

// Correct credentials from docker-compose.yml
const client = new Client({
    connectionString: 'postgresql://user_admin:password_admin@127.0.0.1:5555/transformafacil_db?schema=public'
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to DB...');

        // 1. Add deletedAt to Shift
        console.log('Adding deletedAt to Shift...');
        await client.query(`ALTER TABLE "Shift" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);`);

        // 2. Add deletedAt to Payment
        console.log('Adding deletedAt to Payment...');
        await client.query(`ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);`);

        // 3. Create ActionLog Table
        console.log('Creating ActionLog table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "ActionLog" (
                "id" SERIAL PRIMARY KEY,
                "tenantId" INTEGER NOT NULL,
                "userId" INTEGER,
                "action" TEXT NOT NULL,
                "details" TEXT,
                "ipAddress" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                
                CONSTRAINT "ActionLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
                CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
            );
        `);

        console.log('Migration Complete!');

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

migrate();
