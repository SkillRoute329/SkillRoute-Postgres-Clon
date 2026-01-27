
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function main() {
    const tenantId = 1;
    const queryDate = 'NOW()';

    const query = `
            SELECT 
                c.*,
                COALESCE(
                    (SELECT "baseValue" FROM "ShiftCategoryPriceHistory" 
                     WHERE "categoryId" = c.id AND "effectiveDate" <= ${queryDate} 
                     ORDER BY "effectiveDate" DESC LIMIT 1),
                    c."baseValue"
                ) as "effectiveBaseValue",
                COALESCE(
                    (SELECT "extraHourValue" FROM "ShiftCategoryPriceHistory" 
                     WHERE "categoryId" = c.id AND "effectiveDate" <= ${queryDate} 
                     ORDER BY "effectiveDate" DESC LIMIT 1),
                    c."extraHourValue"
                ) as "effectiveExtraHourValue"
            FROM "ShiftCategory" c
            WHERE c."tenantId" = $1
            ORDER BY c.name ASC
  `;

    try {
        console.log('Running Query...');
        const res = await pool.query(query, [tenantId]);
        console.log('Query Success:', res.rowCount);
    } catch (err) {
        console.error('SQL ERROR:', err.message);
        console.error('Detail:', err.detail);
        console.error('Hint:', err.hint);
    } finally {
        pool.end();
    }
}

main();
