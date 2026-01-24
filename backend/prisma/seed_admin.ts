
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const passwordHash = await bcrypt.hash('admin123', 10);

    console.log('🌱 Seeding Super Admin...');

    // 1. Ensure Tenant exists
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'ucot' } });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: { name: 'UCOT', slug: 'ucot' }
        });
        console.log('Created Tenant: UCOT');
    }

    // 2. Create User
    let user = await prisma.user.findFirst({
        where: { internalNumber: '0000', tenantId: tenant.id }
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                tenantId: tenant.id,
                internalNumber: '0000',
                ci: '0000',
                firstName: 'Super',
                lastName: 'Admin',
                fullName: 'Super Admin',
                passwordHash: passwordHash,
                role: 'SuperAdmin',
            }
        });
        console.log('Created User: 0000');
    } else {
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash, role: 'SuperAdmin', ci: '0000' }
        });
        console.log('Updated User: 0000');
    }

    // 3. Employee
    const employee = await prisma.employee.findUnique({
        where: { userId: user.id }
    });

    if (!employee) {
        await prisma.employee.create({
            data: {
                firstName: 'Super',
                lastName: 'Admin',
                ci: '0000',
                position: 'Director Sistema',
                userId: user.id,
            }
        });
        console.log('Created Employee Profile');
    }

    console.log('✅ Seed complete. User: 0000 / Pass: admin123');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
