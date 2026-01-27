require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB');

        const query = `
            CREATE TABLE IF NOT EXISTS "Payment" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "amount" DECIMAL(10,2) NOT NULL,
                "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "isClosed" BOOLEAN NOT NULL DEFAULT false,
                "notes" TEXT,
                CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
            );
        `;

        await client.query(query);
        console.log('Table Payment created successfully');

        await client.end();
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

run();
