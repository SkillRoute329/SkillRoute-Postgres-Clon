"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../src/db"));
async function verifyAdminPayout() {
    try {
        console.log('--- Debugging Transforma Facil Shifts ---');
        // 1. List all shifts marked as Transforma Facil
        const rawShiftsQuery = `
            SELECT id, "serviceNumber", "status", "totalValue", "transformaFacil", "transformaFacilDiscount"
            FROM "Shift"
            WHERE "transformaFacil" = true;
        `;
        const rawRes = await db_1.default.query(rawShiftsQuery);
        console.log('Raw Transforma Facil Shifts:', rawRes.rows);
        // 2. Run the exact calculation query used in shiftController
        const calcQuery = `
            SELECT COALESCE(SUM("totalValue" - COALESCE("transformaFacilDiscount", 0)), 0) as total_liability
            FROM "Shift" 
            WHERE "transformaFacil" = true 
            AND ("status" = 'Assigned' OR "status" = 'Public' OR "status" = 'Created');
        `;
        const calcRes = await db_1.default.query(calcQuery);
        console.log('Calculated Liability (A Cubrir):', calcRes.rows[0]);
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await db_1.default.end();
    }
}
verifyAdminPayout();
//# sourceMappingURL=debug_admin_payout.js.map