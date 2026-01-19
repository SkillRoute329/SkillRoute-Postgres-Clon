
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🌱 Seeding Service Matrices (Cartones) with EXACT DATA...');

    // 1. Get/Create Tenant and Season
    const tenant = await prisma.tenant.findFirst({ where: { slug: 'ucot' } }) ||
        await prisma.tenant.findFirst() ||
        await prisma.tenant.create({ data: { name: 'UCOT', slug: 'ucot' } });

    const season = await prisma.season.findFirst({ where: { name: 'Verano 2026' } }) ||
        await prisma.season.create({
            data: {
                tenantId: tenant.id,
                name: 'Verano 2026',
                startDate: new Date('2026-01-01'),
                endDate: new Date('2026-12-31')
            }
        });

    const createMatrix = async (data: any) => {
        console.log(`Creating Matrix: Line ${data.line} - ${data.variant}...`);

        const headers = data.headers.map((h: string, idx: number) => ({
            id: `h${idx + 1}`,
            location: h,
            isStop: true
        }));

        const rows = data.rows.map((r: string[], idx: number) => {
            const serviceNumber = r[0];
            const times: any = {};
            r.slice(1).forEach((time, tIdx) => {
                times[`h${tIdx + 1}`] = time;
            });
            return {
                id: `r${idx + 1}`,
                serviceNumber,
                times
            };
        });

        const serviceNumberKey = `${data.line}-${data.serviceNumberPrefix}`;

        await prisma.serviceDefinition.upsert({
            where: {
                tenantId_seasonId_serviceNumber: {
                    tenantId: tenant.id,
                    seasonId: season.id,
                    serviceNumber: serviceNumberKey
                }
            },
            update: {
                line: data.line,
                variant: data.variant,
                startTime: rows[0].times['h1'],
                endTime: rows[0].times[`h${headers.length}`],
                routeData: JSON.stringify({
                    startLocationDescription: `Salida de ${headers[0].location}`,
                    headers,
                    rows
                })
            },
            create: {
                tenantId: tenant.id,
                seasonId: season.id,
                serviceNumber: serviceNumberKey,
                line: data.line,
                variant: data.variant,
                startTime: rows[0].times['h1'],
                endTime: rows[0].times[`h${headers.length}`],
                totalHours: '08:00',
                liquidHours: '07:00',
                kilometers: '100',
                routeData: JSON.stringify({
                    startLocationDescription: `Salida de ${headers[0].location}`,
                    headers,
                    rows
                })
            }
        });
    };

    // --- LINE 300 IDA ---
    await createMatrix({
        line: '300',
        variant: 'Sentido A - Ida',
        serviceNumberPrefix: 'IDA',
        headers: ["Instrucc y Bell", "Gral Flores", "Intercamb Bell", "20 de Febrero", "8 oct / JB Ordoñez", "Tres Cruces", "D.Nardone", "Crio. Central"],
        rows: [
            ["1006", "04:30", "04:45", "04:54", "04:57", "05:06", "05:18", "05:29", "05:39"],
            ["1103", "05:08", "05:23", "05:32", "05:35", "05:46", "05:58", "06:09", "06:19"],
            ["1007", "05:30", "05:45", "05:54", "05:57", "06:06", "06:18", "06:29", "06:39"]
        ]
    });

    // --- LINE 306 IDA ---
    await createMatrix({
        line: '306',
        variant: 'Sentido A - Casabó -> Geant',
        serviceNumberPrefix: 'IDA',
        headers: ["Casabó", "Tnal Cerro", "E. Romero", "Burgues", "Serrato", "20 de Febrero", "Intercambiador", "Feliz/Pitagoras", "Pta Gorda", "Geant"],
        rows: [
            ["1119", "C.Tab.", "04:34", "04:37", "04:47", "05:00", "05:12", "05:24", "05:46", "06:01", ""],
            ["1017", "04:49", "04:57", "05:02", "05:12", "05:24", "05:36", "05:48", "06:10", "06:28", "06:42"]
        ]
    });

    // --- LINE 306 VUELTA ---
    await createMatrix({
        line: '306',
        variant: 'Sentido B - Geant -> Casabó',
        serviceNumberPrefix: 'VUELTA',
        headers: ["Geant", "Pta Gorda", "Zum Felde", "Intercambiador", "Ramon Castriz", "Serrato", "Burgues", "E. Romero", "Cerro - Terminal", "Casabó"],
        rows: [
            ["1119 a-Hotel", "04:34", "04:37", "04:47", "04:57", "05:00", "05:12", "05:24", "05:32", "05:46", "06:01"],
            ["1051", "Espe", "necer", "05:10", "05:14", "05:25", "05:50", "05:59", "06:08", "06:23", "06:40"]
        ]
    });

    console.log('✅ All Matrices seeded successfully!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
