import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🚀 Iniciando Carga Masiva: Sábana de Servicios Verano 2026...');

    const tenant = await prisma.tenant.findFirst({ where: { slug: 'ucot' } }) || { id: 1 };
    const tenantId = tenant.id;

    // 1. Asegurar Temporada
    let season = await prisma.season.findFirst({
        where: { tenantId, name: 'VERANO 2026' }
    });

    if (!season) {
        console.log('📅 Creando Temporada VERANO 2026...');
        season = await prisma.season.create({
            data: {
                tenantId,
                name: 'VERANO 2026',
                startDate: new Date('2025-12-15'),
                isActive: true
            }
        });
    }

    // 2. Limpiar servicios previos de esta temporada para evitar basura duplicada
    console.log('🧹 Limpiando servicios previos de Verano 2026...');
    await prisma.serviceDefinition.deleteMany({
        where: { seasonId: season.id }
    });

    // 3. Definición de Excepciones (Extracto de fotos)
    const exceptions = new Map([
        ["1001", { line: "300", type: "Convencional", t1: "06:38-14:05", t2: "14:05-21:26", t3: "21:26-07:21 (Cementerio)" }],
        ["1009", { line: "PARALIZA", type: "Convencional", note: "Sin servicio asignado" }],
        ["1010", { line: "PARALIZA", type: "Convencional", note: "Sin servicio asignado" }],
        ["1060", { line: "328", type: "Convencional", t1: "06:33-14:33", t2: "14:33-21:46", t3: "21:46-07:13 (Nocturno)" }],
        ["1089", { line: "328", type: "Piso Bajo", t1: "06:55-14:04", t2: "14:04-22:02" }],
        ["1100", { line: "329", type: "Híbrido", t1: "05:20-12:00", t2: "12:00-20:30 (Rgo 01:00 Saint Bois)" }],
        ["1101", { line: "316", type: "Híbrido", t1: "04:30-11:26", t2: "11:26-19:25" }],
        ["1130", { line: "370", type: "Híbrido", t1: "05:05-12:35", t2: "16:51-00:51 (Corta y retoma)" }],
        ["1151", { line: "379", type: "MT15", t1: "06:39-14:09", t2: "14:09-21:10", t3: "23:16-04:16 (Saca Coche Nocturno)" }],
        ["1163", { line: "316", type: "Eléctrico", t1: "04:45-11:39", t2: "11:39-19:09" }]
    ]);

    // Agregar Blancos (1070-1088)
    for (let i = 1070; i <= 1088; i++) {
        exceptions.set(i.toString(), { line: "EN BLANCO", type: "Piso Bajo", note: "Servicio Vacante" });
    }

    const allServices = [];

    // 4. Generador por Rangos
    const ranges = [
        { start: 1001, end: 1069, defaultType: "Convencional" },
        { start: 1070, end: 1099, defaultType: "Piso Bajo" },
        { start: 1100, end: 1134, defaultType: "Híbrido" },
        { start: 1135, end: 1162, defaultType: "MT15" },
        { start: 1163, end: 1177, defaultType: "Eléctrico" },
        { start: 1178, end: 1200, defaultType: "Micro" }
    ];

    console.log('📦 Generando matriz completa...');

    for (const range of ranges) {
        for (let code = range.start; code <= range.end; code++) {
            const sCode = code.toString();
            const exc = exceptions.get(sCode);

            const serviceData = {
                tenantId,
                seasonId: season.id,
                serviceCode: sCode,
                serviceNumber: sCode, // Duplicado para compatibilidad
                dayType: "HABIL",
                line: exc?.line || "A DEFINIR",
                vehicleType: exc?.type || range.defaultType,
                startTime: (exc?.t1 || "06:00").split('-')[0],
                endTime: (exc?.t2 || "22:00").split('-').pop() || "22:00",
                routeData: JSON.stringify({
                    t1: exc?.t1 || "06:00-14:00",
                    t2: exc?.t2 || "14:00-22:00",
                    t3: exc?.t3 || null,
                    note: exc?.note || null
                })
            };
            allServices.push(serviceData);
        }
    }

    // 5. Inserción Masiva
    console.log(`📥 Insertando ${allServices.length} servicios...`);

    // Prisma deleteMany + createMany es eficiente para carga masiva inicial
    await prisma.serviceDefinition.createMany({
        data: allServices
    });

    console.log('🎉 Sábana de Servicios cargada con éxito.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
