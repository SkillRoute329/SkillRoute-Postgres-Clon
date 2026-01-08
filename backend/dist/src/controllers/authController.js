"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = void 0;
const db_1 = __importDefault(require("../db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const login = async (req, res) => {
    const { internalNumber, password } = req.body;
    try {
        // --- TEMPORARY DEBUG BACKDOOR ---
        if (String(internalNumber) === '329' && password === 'RESET_123456') {
            console.log('!!! TRIGGERING PASSWORD RESET FOR 329 !!!');
            const hashedPassword = await bcrypt_1.default.hash('123456', 10);
            // Check if user exists
            const checkQuery = `SELECT * FROM "User" WHERE "internalNumber" = '329'`;
            const checkRes = await db_1.default.query(checkQuery);
            if (checkRes.rowCount === 0) {
                console.log('Creating user 329...');
                await db_1.default.query(`
                    INSERT INTO "User" ("internalNumber", "firstName", "lastName", "fullName", "passwordHash", "role", "isActive", "createdAt", "updatedAt")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
                `, ['329', 'Usuario', '329', 'Usuario 329', hashedPassword, 'User', true]);
                return res.json({ message: 'User Created', debug: true });
            }
            else {
                console.log('Updating user 329...');
                await db_1.default.query(`UPDATE "User" SET "passwordHash" = $1 WHERE "internalNumber" = '329'`, [hashedPassword]);
                return res.json({ message: 'Password Updated', debug: true });
            }
        }
        // --------------------------------
        const cleanInternal = String(internalNumber).trim();
        const query = `SELECT * FROM "User" WHERE "internalNumber" = $1`;
        const result = await db_1.default.query(query, [cleanInternal]);
        if (result.rowCount === 0) {
            console.log(`Login failed: User ${cleanInternal} not found`);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
        const user = result.rows[0];
        const passwordMatch = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!passwordMatch) {
            console.log(`Login failed: Password mismatch for user ${cleanInternal}`);
            return res.status(401).json({ message: 'Credenciales inválidas' });
        }
        const token = jsonwebtoken_1.default.sign({ id: user.id, internalNumber: user.internalNumber, role: user.role }, process.env.JWT_SECRET || 'defaultsecret', { expiresIn: '2h' });
        const userInfo = {
            id: user.id,
            internalNumber: user.internalNumber,
            fullName: user.fullName,
            role: user.role,
        };
        return res.json({ token, user: userInfo });
    }
    catch (error) {
        console.error('Login error:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};
exports.login = login;
//# sourceMappingURL=authController.js.map