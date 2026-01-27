import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Specify the path to .env explicitly to be safe
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
    const internalNumber = '329';
    const newPassword = '123456';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    console.log(`Checking user ${internalNumber}...`);

    const user = await prisma.user.findFirst({
        where: { internalNumber }
    });

    if (user) {
        console.log(`User found: ${user.firstName} ${user.lastName} (ID: ${user.id})`);
        console.log('Updating password...');

        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword }
        });

        console.log('✅ Password updated successfully to: 123456');
    } else {
        console.log('❌ User not found!');
        console.log('Creating user...');

        await prisma.user.create({
            data: {
                internalNumber,
                firstName: 'Usuario',
                lastName: '329',
                passwordHash: hashedPassword,
                role: 'User',
                isActive: true
            }
        });

        console.log('✅ User created with password: 123456');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
