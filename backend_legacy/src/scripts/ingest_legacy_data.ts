
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DATA_DIR = 'c:/Users/jonat/Desktop/trasnfomaFacil2.0/TransformaFacil-2.0/backend/legacy_data';

interface FileReport {
    file: string;
    status: 'OK' | 'ERROR';
    lineDetected: string;
    tripsExtracted: number | string;
}

// --- UTILS ---
const parseTime = (val: string): string => {
    if (!val) return '';
    if (val.includes(':')) return val.trim();
    const floatVal = parseFloat(val);
    if (!isNaN(floatVal)) {
        const totalMinutes = Math.round(floatVal * 24 * 60);
        return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
    }
    return val;
};

const parseCSV = (content: string) => {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    // Find header
    const headerIdx = lines.findIndex(l => l.toUpperCase().includes('SERVICIO') && l.toUpperCase().includes('SALE'));
    if (headerIdx === -1) return { headers: [], body: [] };

    const headers = lines[headerIdx].split(',').map(h => h.trim());
    const body = lines.slice(headerIdx + 1).map(l => {
        const row = l.split(',');
        const obj: any = {};
        headers.forEach((h, i) => obj[h] = row[i]?.trim());
        return obj;
    });
    return { headers, body };
};

// --- MAIN ---
async function main() {
    const report: FileReport[] = [];
    const files = fs.readdirSync(DATA_DIR);

    // Sort so Cartones process before Daily
    files.sort((a, b) => {
        if (a.includes('R-21')) return 1;
        if (b.includes('R-21')) return -1;
        return 0;
    });

    console.log(`🔍 Found ${files.length} files to process.`);

    let totalTrips = 0;
    const processedLines = new Set<string>();

    for (const file of files) {
        const entry: FileReport = { file, status: 'OK', lineDetected: '-', tripsExtracted: 0 };
        const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');

        try {
            if (file.includes('CARTON') || file.includes('BOLETIN')) {
                // 1. Identify Line
                const lineMatch = file.match(/(?:LINEA_|_)(\w+?)(?:a|b)?\.csv/i) || file.match(/(\d+)/);
                const lineName = lineMatch ? lineMatch[1] : 'UNK';

                // Direction Heuristic
                const direction = file.toLowerCase().includes('a.csv') || file.toLowerCase().includes('ida') ? 'IDA' : 'VUELTA';
                entry.lineDetected = `${lineName} (${direction})`;
                processedLines.add(lineName);

                // 2. Parse
                const { headers, body } = parseCSV(content);

                // 3. Persist Route
                const route = await prisma.route.upsert({
                    where: { tenantId_name: { tenantId: 1, name: lineName } },
                    update: {},
                    create: { tenant: { connect: { id: 1 } }, name: lineName, type: 'URBANA', description: 'Mass Import' }
                });

                // 4. Persist Variant
                const variantName = direction;
                const variant = await prisma.routeVariant.upsert({
                    where: { routeId_name: { routeId: route.id, name: variantName } },
                    update: {},
                    create: {
                        routeId: route.id,
                        name: variantName,
                        origin: direction === 'IDA' ? 'Origen' : 'Destino',
                        destination: direction === 'IDA' ? 'Destino' : 'Origen',
                        geometry: '[]'
                    }
                });

                // 5. Sequences
                const stopCols = headers.filter(h => h !== 'Servicio' && h !== 'Sale' && h !== 'Llegada');
                for (let i = 0; i < stopCols.length; i++) {
                    await prisma.routeSequence.upsert({
                        where: { variantId_order: { variantId: variant.id, order: i } },
                        update: { stopName: stopCols[i] },
                        create: { variantId: variant.id, order: i, stopName: stopCols[i] }
                    });
                }

                // 6. Trips
                let tripsCount = 0;
                const sequences = await prisma.routeSequence.findMany({ where: { variantId: variant.id } });

                for (const row of body) {
                    if (!row['Servicio']) continue;
                    const startTime = parseTime(row['Sale']);

                    const trip = await prisma.tripSchedule.create({
                        data: {
                            variantId: variant.id,
                            serviceId: row['Servicio'],
                            dayType: 'HABIL',
                            startTime
                        }
                    });
                    tripsCount++;
                    totalTrips++;

                    // Times
                    for (const seq of sequences) {
                        const t = parseTime(row[seq.stopName]);
                        if (t) await prisma.tripTime.create({ data: { tripScheduleId: trip.id, sequenceId: seq.id, time: t } });
                    }
                }
                entry.tripsExtracted = tripsCount;

            } else if (file.includes('R-21') || file.includes('COCHES')) {
                // DAILY REPORT
                entry.lineDetected = 'FLOTA 21/01';

                const { body } = parseCSV(content);
                let vehiclesAdded = 0;

                // Date Parsing
                const dateMatch = file.match(/(\d{2})\.(\d{2})\.(\d{4})/);
                const opDate = dateMatch ? new Date(`${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}T10:00:00Z`) : new Date();

                for (const row of body) {
                    if (!row['Coche']) continue;
                    const carNum = row['Coche'];

                    // Upsert Vehicle (Real)
                    await prisma.vehicle.upsert({
                        where: { tenantId_internalNumber: { tenantId: 1, internalNumber: carNum } },
                        update: { status: 'ACTIVE' },
                        create: {
                            tenant: { connect: { id: 1 } },
                            internalNumber: carNum,
                            plate: `SBU-${carNum}`,
                            status: 'ACTIVE',
                            make: 'Yutong', // Default
                            model: 'Imported'
                        }
                    });

                    // Create Shift
                    await prisma.shift.create({
                        data: {
                            tenant: { connect: { id: 1 } },
                            category: { connect: { id: 1 } },
                            serviceNumber: row['Servicio'] || '0',
                            date: opDate,
                            time: parseTime(row['Sale']),
                            line: row['Línea'] || 'VAR',
                            carNumber: carNum,
                            totalValue: 0,
                            creator: { connect: { id: 1 } },
                            status: 'CONFIRMED'
                        }
                    });
                    vehiclesAdded++;
                }
                entry.tripsExtracted = `${vehiclesAdded} Coches Reales`;
            } else {
                entry.status = 'ERROR';
                entry.tripsExtracted = 'Unknown File Type';
            }

        } catch (e) {
            entry.status = 'ERROR';
            entry.tripsExtracted = String(e).substring(0, 50);
        }
        report.push(entry);
    }

    // PRINT REPORT TABLE
    console.log('\n| Archivo | Estado | Línea Detectada | Viajes Extraídos |');
    console.log('| :--- | :--- | :--- | :--- |');
    report.forEach(r => {
        console.log(`| ${r.file} | ${r.status} | ${r.lineDetected} | ${r.tripsExtracted} |`);
    });

    console.log('\nTOTALES FINALES:');
    console.log(`* Líneas Únicas en DB: ${processedLines.size}`);
    console.log(`* Total de Viajes: ${totalTrips}`);

    // QA Check
    if (totalTrips < 100) {
        console.log(`\n❌ CRITICAL: Low trip count (${totalTrips}). Check parsing logic.`);
    } else {
        console.log(`\n✅ Volume Test Passed.`);
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
