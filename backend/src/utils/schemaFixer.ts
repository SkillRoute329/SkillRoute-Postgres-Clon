import pool from '../db';

export const ensureSchemaIntegrity = async () => {
    console.log('🛡️ [Schema] Verificando integridad de la base de datos...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Ensure Notification Table Exists
        await client.query(`
            CREATE TABLE IF NOT EXISTS "Notification" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "title" TEXT NOT NULL,
                "message" TEXT NOT NULL,
                "type" TEXT NOT NULL DEFAULT 'INFO',
                "link" TEXT,
                "isRead" BOOLEAN NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
            );
        `);

        // 2. Ensure User Columns Exist (Safe Idempotent Checks)
        await client.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE "User" ADD COLUMN "phoneNumber" TEXT;
                EXCEPTION
                    WHEN duplicate_column THEN NULL;
                END;
                BEGIN
                    ALTER TABLE "User" ADD COLUMN "whatsappLink" TEXT;
                EXCEPTION
                    WHEN duplicate_column THEN NULL;
                END;
            END $$;
        `);

        // 3. Ensure Shift Columns Exist
        await client.query(`
            DO $$ 
            BEGIN 
                BEGIN
                    ALTER TABLE "Shift" ADD COLUMN "endTime" VARCHAR(5);
                EXCEPTION
                    WHEN duplicate_column THEN NULL;
                END;
                 BEGIN
                    ALTER TABLE "Shift" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false;
                EXCEPTION
                    WHEN duplicate_column THEN NULL;
                END;
            END $$;
        `);

        await client.query('COMMIT');
        console.log('✅ [Schema] Integridad verificada. Tablas y columnas críticas aseguradas.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ [Schema] Error verificando integridad:', error);
        // We don't throw here to avoid crashing if it's just a permission issue, 
        // but we verify logs.
    } finally {
        client.release();
    }
};
