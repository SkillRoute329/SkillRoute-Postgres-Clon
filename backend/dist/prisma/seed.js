"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const bcrypt_1 = __importDefault(require("bcrypt"));
dotenv_1.default.config();
console.log('Using DATABASE_URL:', process.env.DATABASE_URL);
const prisma = new client_1.PrismaClient();
async function main() {
    const categories = [
        { name: 'Turno Micro', baseValue: 3400, extraHourValue: 850 },
        { name: 'Turno Maniobra', baseValue: 2700, extraHourValue: 0 }, // Assuming 0 if not specified, user said just "$2700"
        { name: 'Turno Conductor', baseValue: 2600, extraHourValue: 650 },
        { name: 'Inspección', baseValue: 3000, extraHourValue: 820 },
        { name: 'Turno Guarda', baseValue: 2400, extraHourValue: 600 },
    ];
    for (const cat of categories) {
        const upserted = await prisma.shiftCategory.upsert({
            where: { name: cat.name },
            update: {
                baseValue: cat.baseValue,
                extraHourValue: cat.extraHourValue,
            },
            create: {
                name: cat.name,
                baseValue: cat.baseValue,
                extraHourValue: cat.extraHourValue,
            },
        });
        console.log(`Upserted category: ${upserted.name}`);
    }
    // Create SuperAdmin if not exists
    const superAdmin = await prisma.user.upsert({
        where: { internalNumber: '0000' },
        update: {},
        create: {
            internalNumber: '0000',
            firstName: 'Super',
            lastName: 'Admin',
            fullName: 'Super Admin',
            passwordHash: await bcrypt_1.default.hash('admin123', 10),
            role: 'SuperAdmin',
        }
    });
    console.log(`Upserted SuperAdmin: ${superAdmin.internalNumber}`);
    // Admin for testing manual guide
    await prisma.user.upsert({
        where: { internalNumber: '9999' },
        update: {},
        create: {
            internalNumber: '9999',
            firstName: 'Admin',
            lastName: 'Test',
            fullName: 'Admin Test',
            passwordHash: await bcrypt_1.default.hash('admin123', 10),
            role: 'Admin',
        }
    });
    console.log('Upserted Admin User: 9999');
    // Also create a regular Admin and a User for testing
    await prisma.user.upsert({
        where: { internalNumber: '101' },
        update: {},
        create: {
            internalNumber: '101',
            firstName: 'Juan',
            lastName: 'Conductor',
            fullName: 'Juan Conductor',
            passwordHash: await bcrypt_1.default.hash('user123', 10),
            role: 'User',
        }
    });
    console.log('Upserted Test User: 101');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map