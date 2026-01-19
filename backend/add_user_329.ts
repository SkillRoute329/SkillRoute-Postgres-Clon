import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Upsert user 329
    const user = await prisma.user.upsert({
        where: {
            tenantId_internalNumber: {
                tenantId: 1,
                internalNumber: '329'
            }
        },
        update: {
            passwordHash: hashedPassword,
            role: 'SuperAdmin',
            isActive: true
        },
        create: {
            tenantId: 1,
            internalNumber: '329',
            firstName: 'Usuario',
            lastName: 'Principal',
            fullName: 'Usuario 329',
            passwordHash: hashedPassword,
            role: 'SuperAdmin',
            isActive: true
        }
    });

    console.log(`User 329 created/updated with password 'admin123'`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
