
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Buscando Super Admin (CI=0000)...');

    const passwordHash = await bcrypt.hash('admin123', 10);

    // 1. Ensure Tenant exists
    console.log('🏢 Verificando empresa UCOT...');
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'ucot' } });
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: { name: 'UCOT', slug: 'ucot' }
        });
        console.log('✅ Empresa UCOT creada.');
    } else {
        console.log('✅ Empresa UCOT ya existe.');
    }

    // 2. Create User
    console.log('👤 Creando/Actualizando Usuario 0000...');
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
        console.log('✅ Usuario 0000 creado.');
    } else {
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash, role: 'SuperAdmin', ci: '0000' }
        });
        console.log('✅ Usuario 0000 actualizado.');
    }

    // 3. Employee
    console.log('📋 Vinculando Legajo RRHH...');
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
        console.log('✅ Legajo RRHH creado.');
    } else {
        console.log('✅ Legajo RRHH ya existe.');
    }

    console.log('🚀 ÉXITO: Super Admin listo (User: 0000 / Pass: admin123)');
}

main()
    .catch((e) => {
        console.error('❌ ERROR DE PRUEBA:', e.message);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
