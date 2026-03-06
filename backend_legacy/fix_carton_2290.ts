import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Fixing Carton 2290 structure...');

  const routeData = {
    startLocationDescription: 'EXPRESO A VERACIERTO E IGUA.-',
    headers: [
      { id: 'h1', location: 'Pya.Cerro/Tnal', isStop: true },
      { id: 'h2', location: 'Tnal Cerro', isStop: true },
      { id: 'h3', location: 'E. Romero', isStop: true },
      { id: 'h4', location: 'Agraciada', isStop: true },
      { id: 'h5', location: 'Uruguay/F.Crespo', isStop: true },
      { id: 'h6', location: 'L.A.Herrera y Av.Italia', isStop: true },
      { id: 'h7', location: 'Veracierto', isStop: true },
      { id: 'h8', location: 'Portones', isStop: true },
      { id: 'h9', location: 'ESPERAS', isStop: false }, // Wait column
      { id: 'h10', location: 'Portones Tnal', isStop: true },
      { id: 'h11', location: 'Veracierto', isStop: true },
      { id: 'h12', location: 'L.A.Herrera y Av.Italia', isStop: true },
      { id: 'h13', location: 'Uruguay/F.Crespo', isStop: true },
      { id: 'h14', location: 'Agraciada', isStop: true },
      { id: 'h15', location: 'E. Romero', isStop: true },
      { id: 'h16', location: 'Tnal Cerro', isStop: true },
      { id: 'h17', location: 'Pya.Cerro/Tnal', isStop: true },
      { id: 'h18', location: 'ESPERAS', isStop: false },
    ],
    rows: [
      {
        id: 'r1',
        times: {
          h1: '06:15',
          h2: '06:28',
          h3: '06:42',
          h4: '06:53',
          h5: '07:05',
          h6: '07:18',
          h7: '07:33',
          h8: '07:46',
          h9: '12', // 12 min wait
          h10: '07:58',
          h11: '08:10',
          h12: '08:25',
          h13: '08:38',
          h14: '08:49',
          h15: '09:01',
          h16: '09:16',
          h17: '09:29',
          h18: '11', // 11 min wait
        },
      },
      {
        id: 'r2',
        times: {
          h1: '09:42',
          h2: '09:55',
          h3: '10:09',
          h4: '10:20',
          h5: '10:32',
          h6: '10:45',
          h7: '11:00',
          h8: '11:13',
          h9: '14',
          h10: '11:27',
          h11: '11:39',
          h12: '11:54',
          h13: '12:07',
          h14: '12:18',
          h15: '12:30',
          h16: '12:45',
          h17: '12:58',
          h18: '13',
        },
      },
      {
        id: 'r3',
        times: {
          h1: '13:11',
          h2: '13:24',
          h3: '13:38',
          h4: '13:49',
          h5: '14:01',
          h6: '14:14',
          h7: '14:29',
          h8: '14:42',
          h9: '14',
          h10: '14:56',
          h11: '15:08',
          h12: '15:23',
          h13: '15:36',
          h14: '15:47',
          h15: '15:59',
          h16: '16:14',
          h17: '16:27',
          h18: '13',
        },
      },
      {
        id: 'r4',
        times: {
          h1: '16:40',
          h2: '16:53',
          h3: '17:07',
          h4: '17:18',
          h5: '17:30',
          h6: '17:43',
          h7: '17:58',
          h8: '18:11',
          h9: '13',
          h10: '18:24',
          h11: '18:36',
          h12: '18:51',
          h13: '19:04',
          h14: '19:15',
          h15: '19:27',
          h16: '19:41',
          h17: '19:54',
          h18: '', // End of day
        },
      },
    ],
  };

  const updated = await prisma.serviceDefinition.update({
    where: {
      tenantId_seasonId_serviceNumber: {
        tenantId: 1,
        seasonId: 1,
        serviceNumber: '2290',
      },
    },
    data: {
      // Update metadata to match image details
      variant: 'SABADERO VERANO 2026 UCOT',
      startTime: '04:25',
      endTime: '20:24',
      totalHours: '15:59',
      liquidHours: '14:16',
      kilometers: '229,20',
      routeData: JSON.stringify(routeData),
    },
  });

  console.log(`Updated Carton 2290: ${updated.serviceNumber} - ${updated.variant}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
