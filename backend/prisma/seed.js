"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
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
    // Create SuperAdmin if not exists (Optional, good practice)
    /*
    const superAdmin = await prisma.user.upsert({
      where: { internalNumber: '0000' },
      update: {},
      create: {
        internalNumber: '0000',
        firstName: 'Super',
        lastName: 'Admin',
        fullName: 'Super Admin',
        passwordHash: 'hashed_password_here', // In production use bcrypt
        role: 'SuperAdmin',
      }
    });
    */
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