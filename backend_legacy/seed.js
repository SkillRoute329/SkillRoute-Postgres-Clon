const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const categories = [
    { name: 'Turno Micro', baseValue: 3400, extraHourValue: 850 },
    { name: 'Turno Maniobra', baseValue: 2700, extraHourValue: 0 },
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
