
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const UPLOADS_DIR = path.join(__dirname, '../../legacy_data'); // Using legacy_data as uploads source
const LOG_FILE = path.join(__dirname, '../../ingest_log.txt');

const log = (msg: string) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
    console.log(msg);
};

// Utils
const parseTime = (val: string): string => {
    if (!val) return '';
    if (val.includes(':')) return val.trim();
    const floatVal = parseFloat(val);
    if (!isNaN(floatVal)) {
        const totalMinutes = Math.round(floatVal * 24 * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    return val;
};

const parseCSV = (content: string) => {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
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

export const IngestLegacyData = async () => {
    log("🚀 Starting Ingestion Worker...");
    if (!fs.existsSync(UPLOADS_DIR)) {
        log(`❌ Directory not found: ${UPLOADS_DIR}`);
        return;
    }

    const files = fs.readdirSync(UPLOADS_DIR);
    let processed = 0;

    for (const file of files) {
        log(`📄 Processing ${file}...`);
        try {
            const content = fs.readFileSync(path.join(UPLOADS_DIR, file), 'utf-8');
            const { headers, body } = parseCSV(content);

            if (file.includes('CARTON') || file.includes('BOLETIN')) {
                // Determine Line/Variant
                const lineName = (file.match(/(?:LINEA_|_)(\w+?)(?:a|b)?\./i) || [])[1] || 'UNK';
                const direction = file.toLowerCase().includes('ida') || file.toLowerCase().includes('a.csv') ? 'IDA' : 'VUELTA';

                let route = await prisma.route.findFirst({ where: { name: lineName, tenantId: 1 } });
                if (!route) {
                    route = await prisma.route.create({
                        data: { tenant: { connect: { id: 1 } }, name: lineName, type: 'URBANA', description: 'Auto-Ingested' }
                    });
                }

                const variant = await prisma.routeVariant.upsert({
                    where: { routeId_name: { routeId: route.id, name: direction } },
                    update: {},
                    create: {
                        routeId: route.id,
                        name: direction,
                        origin: direction === 'IDA' ? 'Inicio' : 'Fin',
                        destination: direction === 'IDA' ? 'Fin' : 'Inicio',
                        geometry: '[]'
                    }
                });

                // Stops
                const stopCols = headers.filter(h => !['Servicio', 'Sale', 'Llegada', 'P1', 'P2'].includes(h) || h.startsWith('P')); // Loose heuristic
                // Actual Stops usually are headers not Service/Sale
                const realStops = headers.filter(h => h !== 'Servicio' && h !== 'Sale' && h !== 'Llegada');

                for (let i = 0; i < realStops.length; i++) {
                    await prisma.routeSequence.upsert({
                        where: { variantId_order: { variantId: variant.id, order: i } },
                        update: { stopName: realStops[i] },
                        create: { variantId: variant.id, order: i, stopName: realStops[i] }
                    });
                }

                // Trips
                const sequences = await prisma.routeSequence.findMany({ where: { variantId: variant.id } });
                for (const row of body) {
                    if (!row['Servicio']) continue;

                    const trip = await prisma.tripSchedule.create({
                        data: {
                            variantId: variant.id,
                            serviceId: row['Servicio'],
                            dayType: 'HABIL',
                            startTime: parseTime(row['Sale'])
                        }
                    });

                    for (const seq of sequences) {
                        const t = parseTime(row[seq.stopName]);
                        if (t) await prisma.tripTime.create({ data: { tripScheduleId: trip.id, sequenceId: seq.id, time: t } });
                    }
                }
                log(`✅ Imported Trips for ${lineName} ${direction}`);

            } else if (file.includes('R-21') || file.includes('COCHES')) {
                // Assignments
                for (const row of body) {
                    if (!row['Coche']) continue;
                    const carNum = row['Coche'];

                    // Vehicle
                    await prisma.vehicle.upsert({
                        where: { tenantId_internalNumber: { tenantId: 1, internalNumber: carNum } },
                        update: {},
                        create: {
                            tenant: { connect: { id: 1 } },
                            internalNumber: carNum,
                            status: 'ACTIVE',
                            make: 'Yutong',
                            plate: `SB-${carNum}`
                        }
                    });

                    // Shift
                    await prisma.shift.create({
                        data: {
                            tenant: { connect: { id: 1 } },
                            category: { connect: { id: 1 } },
                            serviceNumber: row['Servicio'] || '0',
                            date: new Date(), // Today
                            time: parseTime(row['Sale']),
                            line: row['Línea'] || 'VAR',
                            carNumber: carNum,
                            totalValue: 0,
                            creator: { connect: { id: 1 } },
                            status: 'CONFIRMED'
                        }
                    });
                }
                log(`✅ Imported Daily Assignments from ${file}`);
            }
            processed++;
        } catch (e) {
            log(`❌ Error processing ${file}: ${e}`);
        }
    }
    log(`🏁 Ingestion Complete. Processed ${processed} files.`);
};
