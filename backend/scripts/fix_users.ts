import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
    console.log('Fixing users...');

    // Fix Driver 101
    const driver = await prisma.user.upsert({
        where: { internalNumber: '101' },
        update: {
            passwordHash: await bcrypt.hash('user123', 10),
            role: 'User'
        },
        create: {
            internalNumber: '101',
            firstName: 'Juan',
            lastName: 'Conductor',
            fullName: 'Juan Conductor',
            passwordHash: await bcrypt.hash('user123', 10),
            role: 'User',
        }
    });
    console.log('Fixed Driver 101:', driver.id);

    // Fix Admin 9999
    const admin = await prisma.user.upsert({
        where: { internalNumber: '9999' },
        update: {
            passwordHash: await bcrypt.hash('admin123', 10),
            role: 'Admin'
        },
        create: {
            internalNumber: '9999',
            firstName: 'Admin',
            lastName: 'Test',
            fullName: 'Admin Test',
            passwordHash: await bcrypt.hash('admin123', 10),
            role: 'Admin',
        }
    });
    console.log('Fixed Admin 9999:', admin.id);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
