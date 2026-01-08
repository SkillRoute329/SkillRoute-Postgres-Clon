
const { Client } = require('pg');

// Correct credentials from docker-compose.yml
const client = new Client({
    connectionString: 'postgresql://user_admin:password_admin@127.0.0.1:5555/transformafacil_db?schema=public'
});

async function migrate() {
    try {
        await client.connect();
        console.log('Connected to DB...');

        // 1. Create Tenant Table
        console.log('Creating Tenant table...');
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Tenant" (
                "id" SERIAL PRIMARY KEY,
                "name" TEXT NOT NULL,
                "slug" TEXT NOT NULL,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
        // Add unique constraint on slug if not exists
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_slug_key" ON "Tenant"("slug");`);

        // 2. Insert Default Tenant (Id 1)
        console.log('Inserting default tenant...');
        await client.query(`
            INSERT INTO "Tenant" ("id", "name", "slug", "isActive", "updatedAt")
            VALUES (1, 'Empresa Principal', 'default', true, CURRENT_TIMESTAMP)
            ON CONFLICT ("id") DO NOTHING;
        `);

        // --- Helper to add tenantId column safely ---
        const addTenantId = async (tableName) => {
            console.log(`Adding tenantId to ${tableName}...`);
            // Add column nullable first
            await client.query(`ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;`);

            // Check if there are rows with null tenantId
            const res = await client.query(`SELECT COUNT(*) FROM "${tableName}" WHERE "tenantId" IS NULL`);
            if (parseInt(res.rows[0].count) > 0) {
                console.log(`Backfilling ${tableName}...`);
                await client.query(`UPDATE "${tableName}" SET "tenantId" = 1 WHERE "tenantId" IS NULL;`);
            }

            // Alter column to be NOT NULL and set Default 1
            // We use a try-catch block for the ALTER in case it's already done
            try {
                await client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "tenantId" SET NOT NULL;`);
                await client.query(`ALTER TABLE "${tableName}" ALTER COLUMN "tenantId" SET DEFAULT 1;`);
            } catch (e) {
                console.log(`Notice: Could not set NOT NULL/DEFAULT on ${tableName} (might already be set). continuing...`);
            }

            // Add FK
            await client.query(`
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${tableName}_tenantId_fkey') THEN
                        ALTER TABLE "${tableName}" ADD CONSTRAINT "${tableName}_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
                    END IF;
                END $$;
            `);
        };

        // 3. Add tenantId to main tables
        await addTenantId('User');
        await addTenantId('ShiftCategory');
        await addTenantId('Shift');
        await addTenantId('CustomFieldDefinition');
        await addTenantId('Payment');

        // SystemConfig is special (Composite PK)
        console.log('Migrating SystemConfig...');
        try {
            await client.query(`ALTER TABLE "SystemConfig" DROP CONSTRAINT IF EXISTS "SystemConfig_pkey";`);
            await addTenantId('SystemConfig');
            await client.query(`ALTER TABLE "SystemConfig" ADD CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("tenantId", "key");`);
        } catch (e) { console.error('Error on SystemConfig:', e.message); }

        // Update Unique Constraints for Multi-Tenancy
        console.log('Updating User constraints...');
        try {
            await client.query(`DROP INDEX IF EXISTS "User_internalNumber_key";`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_internalNumber_key" ON "User"("tenantId", "internalNumber");`);

            await client.query(`DROP INDEX IF EXISTS "User_email_key";`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "User_tenantId_email_key" ON "User"("tenantId", "email");`);
        } catch (e) { console.error('Error on User constraints:', e.message); }

        console.log('Updating ShiftCategory constraints...');
        try {
            await client.query(`DROP INDEX IF EXISTS "ShiftCategory_name_key";`);
            await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ShiftCategory_tenantId_name_key" ON "ShiftCategory"("tenantId", "name");`);
        } catch (e) { console.error('Error on Category constraints:', e.message); }

        console.log('Migration Complete!');

    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await client.end();
    }
}

migrate();
