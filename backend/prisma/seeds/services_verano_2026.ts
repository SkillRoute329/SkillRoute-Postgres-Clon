
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Datos extraídos de la Sábana de Verano 2026 - Casos Piloto
const servicesVerano2026 = [
    // CASO 1: Servicio Estándar (Convencional)
    {
        serviceCode: "1001",
        line: "300",
        seasonName: "VERANO 2026",
        dayType: "HABIL",
        vehicleType: "Convencional", // Rango 1001-1069
        notes: "Servicio Base",
        startTime: "06:38",
        endTime: "21:26",
        routeData: {
            turn1: { start: "06:38", end: "14:05", locationEnd: "Terminal" },
            turn2: { start: "14:05", end: "21:26", locationEnd: "Cementerio Central" }
        }
    },
    // CASO 2: Servicio Híbrido con Recargo y Relevo Específico
    {
        serviceCode: "1100",
        line: "329",
        seasonName: "VERANO 2026",
        dayType: "HABIL",
        vehicleType: "Híbrido", // Rango 1100-1134
        notes: "",
        startTime: "05:20",
        endTime: "20:30",
        routeData: {
            turn1: { start: "05:20", end: "12:00", locationEnd: "Terminal" },
            turn2: {
                start: "12:00",
                end: "20:30",
                reliefPoint: "SAINT BOIS",
                overtime: "01:00" // "Rgo. 01:00" detectado en foto
            }
        }
    },
    // CASO 3: Servicio que "SACA COCHE" y "PARALIZA" (Corta servicio)
    {
        serviceCode: "1130",
        line: "306",
        seasonName: "VERANO 2026",
        dayType: "HABIL",
        vehicleType: "Híbrido",
        notes: "SACA COCHE / PARALIZA",
        startTime: "05:30",
        endTime: "13:00",
        routeData: {
            turn1: { start: "05:30", end: "13:00", locationEnd: "SACA COCHE" },
            turn2: null // No tiene segundo turno
        }
    },
    // CASO 4: Servicio Complejo de 3 Turnos (Nocturno)
    {
        serviceCode: "1151",
        line: "379",
        seasonName: "VERANO 2026",
        dayType: "HABIL",
        vehicleType: "MT15", // Rango 1135-1159
        notes: "SACA COCHE NOCTURNO",
        startTime: "06:39",
        endTime: "04:16",
        routeData: {
            turn1: { start: "06:39", end: "14:09", locationEnd: "Intercambiador Belloni" },
            turn2: { start: "14:09", end: "21:10", locationEnd: "Intercambiador Belloni" },
            turn3: {
                start: "23:16",
                end: "04:16",
                description: "NOCTURNO - SACA COCHE 05:00"
            }
        }
    },
    // CASO 5: Servicio Eléctrico (Nueva Tecnología)
    {
        serviceCode: "1163",
        line: "316",
        seasonName: "VERANO 2026",
        dayType: "HABIL",
        vehicleType: "Eléctrico", // Rango 1163+
        notes: "",
        startTime: "04:45",
        endTime: "19:09",
        routeData: {
            turn1: { start: "04:45", end: "11:39", locationEnd: "Km 16" },
            turn2: { start: "11:39", end: "19:09", locationEnd: "Km 16" }
        }
    }
];

async function main() {
    console.log('🚀 Iniciando Carga de Servicios Piloto (VERANO 2026)...');

    // 1. Obtener Tenant (Asumimos ID 1 o buscamos el primero)
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) throw new Error("No existe Tenant. Ejecuta seed inicial primero.");

    // 2. Asegurar Temporada
    console.log('📅 Verificando Temporada VERANO 2026...');
    let season = await prisma.season.findFirst({
        where: {
            tenantId: tenant.id,
            name: 'VERANO 2026'
        }
    });

    if (!season) {
        console.log('⚠️ Creando Temporada VERANO 2026...');
        season = await prisma.season.create({
            data: {
                tenantId: tenant.id,
                name: 'VERANO 2026',
                startDate: new Date('2026-01-01'), // Fechas aproximadas, ajustables
                endDate: new Date('2026-03-31'),
                isActive: true
            }
        });
    }

    // 3. Carga de Servicios (Upsert)
    console.log(`📦 Procesando ${servicesVerano2026.length} servicios...`);

    for (const s of servicesVerano2026) {
        // Transformar datos a estructura DB
        const serviceData = {
            tenantId: tenant.id,
            seasonId: season.id,
            serviceCode: s.serviceCode,
            serviceNumber: s.serviceCode, // Mapeo directo por ahora
            line: s.line,
            dayType: s.dayType,
            vehicleType: s.vehicleType,
            variant: s.notes || undefined,
            startTime: s.startTime,
            endTime: s.endTime,
            routeData: JSON.stringify(s.routeData) // Serializar estructura compleja
        };

        // Upsert usando la Unique Key Compuesta
        const result = await prisma.serviceDefinition.upsert({
            where: {
                tenantId_seasonId_serviceCode_dayType: { // Esta es la clave generada por Prisma
                    tenantId: tenant.id,
                    seasonId: season.id,
                    serviceCode: s.serviceCode,
                    dayType: s.dayType
                }
            },
            update: serviceData, // Si existe, actualizamos todo porsiaca cambiaron horarios
            create: serviceData
        });

        console.log(`✅ Procesado: Servicio ${s.serviceCode} (${s.vehicleType})`);
    }

    console.log('🎉 Carga de Servicios Piloto Finalizada con Éxito.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
