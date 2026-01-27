import pool from '../src/db';

async function addUserFields() {
    console.log('--- Adding phoneNumber and whatsappLink fields to User table ---');
    try {
        await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phoneNumber" VARCHAR(20)');
        console.log('✓ Added phoneNumber column');

        await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "whatsappLink" VARCHAR(255)');
        console.log('✓ Added whatsappLink column');

        console.log('User table updated successfully!');
    } catch (err) {
        console.error('Error:', err);
    } finally {
        process.exit(0);
    }
}

addUserFields();
