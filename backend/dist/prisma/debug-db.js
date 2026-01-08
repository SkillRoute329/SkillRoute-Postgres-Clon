"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const client = new pg_1.Client({
    connectionString: process.env.DATABASE_URL,
});
async function test() {
    console.log('Testing connection to:', process.env.DATABASE_URL);
    try {
        await client.connect();
        const res = await client.query('SELECT NOW()');
        console.log('Success! Database time:', res.rows[0]);
    }
    catch (err) {
        console.error('Connection error:', err);
    }
    finally {
        await client.end();
    }
}
test();
//# sourceMappingURL=debug-db.js.map