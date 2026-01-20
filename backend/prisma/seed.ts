import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();
console.log('Using DATABASE_URL:', process.env.DATABASE_URL);

const prisma = new PrismaClient();

async function main() {
  // 1. Ensure Default Tenant
  const defaultTenant = await prisma.tenant.upsert({
    where: { slug: 'ucot-default' },
    update: {},
    create: {
      id: 1, // Force ID 1 if possible, or let autoincrement but use it globally
      name: 'UCOT (Default)',
      slug: 'ucot-default',
      isActive: true
    }
  });
  console.log(`Upserted Tenant: ${defaultTenant.name}`);

  const categories = [
    { name: 'Turno Micro', baseValue: 3400, extraHourValue: 850 },
    { name: 'Turno Maniobra', baseValue: 2700, extraHourValue: 0 },
    { name: 'Turno Conductor', baseValue: 2600, extraHourValue: 650 },
    { name: 'Inspección', baseValue: 3000, extraHourValue: 820 },
    { name: 'Turno Guarda', baseValue: 2400, extraHourValue: 600 },
  ];

  for (const cat of categories) {
    const upserted = await prisma.shiftCategory.upsert({
      where: {
        tenantId_name: { // Unique constraint
          tenantId: defaultTenant.id,
          name: cat.name
        }
      },
      update: {
        baseValue: cat.baseValue,
        extraHourValue: cat.extraHourValue,
      },
      create: {
        tenantId: defaultTenant.id,
        name: cat.name,
        baseValue: cat.baseValue,
        extraHourValue: cat.extraHourValue,
      },
    });
    console.log(`Upserted category: ${upserted.name}`);
  }

  // Create SuperAdmin
  const superAdmin = await prisma.user.upsert({
    where: {
      tenantId_internalNumber: {
        tenantId: defaultTenant.id,
        internalNumber: '0000'
      }
    },
    update: { role: 'SuperAdmin', passwordHash: await bcrypt.hash('admin123', 10) },
    create: {
      tenantId: defaultTenant.id,
      internalNumber: '0000',
      firstName: 'Super',
      lastName: 'Admin',
      fullName: 'Super Admin',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'SuperAdmin',
    }
  });
  console.log(`Upserted SuperAdmin: ${superAdmin.internalNumber}`);

  // Admin for testing
  await prisma.user.upsert({
    where: {
      tenantId_internalNumber: {
        tenantId: defaultTenant.id,
        internalNumber: '9999'
      }
    },
    update: { role: 'Admin' },
    create: {
      tenantId: defaultTenant.id,
      internalNumber: '9999',
      firstName: 'Admin',
      lastName: 'Test',
      fullName: 'Admin Test',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'Admin',
    }
  });
  console.log('Upserted Admin User: 9999');

  // Test User
  await prisma.user.upsert({
    where: {
      tenantId_internalNumber: {
        tenantId: defaultTenant.id,
        internalNumber: '101'
      }
    },
    update: {},
    create: {
      tenantId: defaultTenant.id,
      internalNumber: '101',
      firstName: 'Juan',
      lastName: 'Conductor',
      fullName: 'Juan Conductor',
      passwordHash: await bcrypt.hash('user123', 10),
      role: 'User',
    }
  });
  console.log('Upserted Test User: 101');

  // --- NEW: Traffic Department Seeds ---
  console.log('--- Iniciando Seeds de Tránsito ---');
  const { seedServicesVerano2026 } = await import('../src/seeds/services_verano_2026');
  const { seedBoletinesData } = await import('../src/seeds/boletines_data');

  await seedServicesVerano2026(prisma);
  await seedBoletinesData(prisma);
  console.log('--- Finalizado Seeds de Tránsito ---');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });