"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = __importDefault(require("../src/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
async function seed() {
    console.log('--- Manual Seed (Raw PG with Bcrypt) ---');
    try {
        // 1. Categories
        const categories = [
            { name: 'Turno Micro', baseValue: 3400, extraHourValue: 850 },
            { name: 'Turno Maniobra', baseValue: 2700, extraHourValue: 0 },
            { name: 'Turno Conductor', baseValue: 2600, extraHourValue: 650 },
            { name: 'Inspección', baseValue: 3000, extraHourValue: 820 },
            { name: 'Turno Guarda', baseValue: 2400, extraHourValue: 600 },
        ];
        for (const cat of categories) {
            await db_1.default.query(`INSERT INTO "ShiftCategory" (name, "baseValue", "extraHourValue", "updatedAt") 
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (name) DO UPDATE SET "baseValue" = $2, "extraHourValue" = $3`, [cat.name, cat.baseValue, cat.extraHourValue]);
            console.log(`Seed Category: ${cat.name}`);
        }
        // 2. Initial Users with bcrypt hashed passwords
        const users = [
            { internalNumber: '0000', firstName: 'Super', lastName: 'Admin', fullName: 'Super Admin', password: 'admin123', role: 'SuperAdmin' },
            { internalNumber: '101', firstName: 'Juan', lastName: 'Conductor', fullName: 'Juan Conductor', password: 'user123', role: 'User' },
        ];
        for (const user of users) {
            const passwordHash = await bcrypt_1.default.hash(user.password, 10);
            await db_1.default.query(`INSERT INTO "User" ("internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role") 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ("internalNumber") DO UPDATE SET "passwordHash" = $5`, [user.internalNumber, user.firstName, user.lastName, user.fullName, passwordHash, user.role]);
            console.log(`Seed User: ${user.internalNumber} (password hashed)`);
        }
        console.log('Seed completed successfully!');
    }
    catch (err) {
        console.error('Seed error:', err);
    }
    finally {
        process.exit(0);
    }
}
seed();
//# sourceMappingURL=manual-seed.js.map