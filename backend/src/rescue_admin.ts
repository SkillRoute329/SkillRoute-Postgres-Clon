
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function rescueSuperAdmin() {
    const email = 'superadmin@transformafacil.com';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    console.log('🚑 Iniciando rescate de SuperAdmin...');

    // 1. Asegurar Tenant Default
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'ucot' } });
    if (!tenant) {
        console.log('Creando Tenant UCOT...');
        tenant = await prisma.tenant.create({
            data: { name: 'UCOT', slug: 'ucot' }
        });
    }

    // 2. Upsert SuperAdmin
    const superAdmin = await prisma.user.upsert({
        where: {
            tenantId_internalNumber: {
                tenantId: tenant.id,
                internalNumber: '0000'
            }
        },
        update: {
            passwordHash: hashedPassword,
            role: 'SuperAdmin',
            firstName: 'Super',
            lastName: 'Admin',
            fullName: 'Super Admin',
            isActive: true
        },
        create: {
            tenantId: tenant.id,
            internalNumber: '0000',
            firstName: 'Super',
            lastName: 'Admin',
            fullName: 'Super Admin',
            email: email,
            passwordHash: hashedPassword,
            role: 'SuperAdmin',
            isActive: true
        }
    });

    console.log('✅ SuperAdmin rescatado exitosamente:');
    console.log(`   Usuario: ${superAdmin.internalNumber}`);
    console.log(`   Password: ${password}`);
    console.log(`   Rol: ${superAdmin.role}`);
    console.log(`   Tenant: ${tenant.name} (${tenant.id})`);
}

rescueSuperAdmin()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
