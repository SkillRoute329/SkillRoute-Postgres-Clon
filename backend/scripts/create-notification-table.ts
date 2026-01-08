
import pool from '../src/db';

async function migrate() {
    try {
        console.log('--- Creating Notification Table ---');
        await pool.query(`
      CREATE TABLE IF NOT EXISTS "Notification" (
        "id" SERIAL PRIMARY KEY,
        "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        "title" VARCHAR(255) NOT NULL,
        "message" TEXT NOT NULL,
        "isRead" BOOLEAN DEFAULT FALSE,
        "type" VARCHAR(50) DEFAULT 'INFO',
        "link" VARCHAR(255),
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        console.log('Notification table created successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrate();
