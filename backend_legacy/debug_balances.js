require('dotenv').config();
const { Client } = require('pg');

const client = new Client({
    connectionString: process.env.DATABASE_URL,
});

async function run() {
    try {
        await client.connect();

        const query = `
      WITH UserBalances AS (
        SELECT 
          s."assignedTo" as user_id,
          u."internalNumber",
          u."firstName",
          u."lastName",
          0 as cedidos,
          COALESCE(SUM(s."totalValue"), 0) as tomados
        FROM "Shift" s
        JOIN "User" u ON s."assignedTo" = u.id
        WHERE s."status" = 'Assigned' AND s."isPaid" = false
        GROUP BY s."assignedTo", u."internalNumber", u."firstName", u."lastName"

        UNION ALL

        SELECT 
          s."createdBy" as user_id,
          u."internalNumber",
          u."firstName",
          u."lastName",
          COALESCE(SUM(s."totalValue"), 0) as cedidos,
          0 as tomados
        FROM "Shift" s
        JOIN "User" u ON s."createdBy" = u.id
        WHERE s."assignedTo" IS NOT NULL 
          AND s."assignedTo" != s."createdBy" 
          AND s."isPaid" = false
        GROUP BY s."createdBy", u."internalNumber", u."firstName", u."lastName"
        
        UNION ALL
        
        SELECT
            p."userId" as user_id,
            u."internalNumber",
            u."firstName",
            u."lastName",
            COALESCE(SUM(p."amount"), 0) as cedidos,
            0 as tomados
        FROM "Payment" p
        JOIN "User" u ON p."userId" = u.id
        WHERE p."isClosed" = false
        GROUP BY p."userId", u."internalNumber", u."firstName", u."lastName"
      )
      SELECT 
        user_id,
        "internalNumber" as "internalNumber",
        "firstName",
        "lastName",
        SUM(cedidos) as cedidos,
        SUM(tomados) as tomados,
        (SUM(tomados) - SUM(cedidos)) as balance
      FROM UserBalances
      GROUP BY user_id, "internalNumber", "firstName", "lastName"
      ORDER BY "internalNumber" ASC
    `;

        const res = await client.query(query);
        console.log('Result Count:', res.rowCount);
        console.table(res.rows);

        await client.end();
    } catch (e) {
        console.error(e);
    }
}

run();
