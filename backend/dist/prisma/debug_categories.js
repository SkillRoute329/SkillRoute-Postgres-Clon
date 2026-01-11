"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const db_1 = __importDefault(require("../src/db"));
async function listCategories() {
    try {
        const res = await db_1.default.query('SELECT * FROM "ShiftCategory" ORDER BY id ASC');
        const output = JSON.stringify(res.rows, null, 2);
        fs_1.default.writeFileSync('prisma/debug_output.txt', output);
        console.log('Done writing');
    }
    catch (error) {
        console.error('Error:', error);
    }
    finally {
        await db_1.default.end();
    }
}
listCategories();
//# sourceMappingURL=debug_categories.js.map