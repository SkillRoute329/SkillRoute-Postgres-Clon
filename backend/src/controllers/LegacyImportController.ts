
import { Request, Response } from 'express';
import { LegacyFileParser } from '../utils/LegacyFileParser';
import { SystemAudit } from '../utils/DataAuditor';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const LegacyImportController = {
    upload: async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ message: 'No file uploaded' });
            }

            const parsed = await LegacyFileParser(req.file.buffer, req.file.originalname);
            console.log(`[LegacyImport] Detected ${parsed.type} with ${parsed.data.length} rows`);

            // If query param 'confirm=true' is present, we persist. Otherwise just analyze.
            const confirm = req.query.confirm === 'true';

            if (!confirm) {
                return res.json({
                    message: `Archivo detectado: ${parsed.type}. Se encontraron ${parsed.data.length} registros.`,
                    preview: parsed.data.slice(0, 5),
                    type: parsed.type,
                    count: parsed.data.length
                });
            }

            // --- PERSISTENCE LOGIC ---
            if (parsed.type === 'CARTON') {
                // --- SMART LINKING LOGIC ---
                const filename = req.file.originalname.toUpperCase();

                // 1. Identify Line (e.g. "306" from "CARTON LINEA 306...")
                const lineMatch = filename.match(/(?:LINEA|LÍNEA|L)\s*(\w+)/i) || filename.match(/^(\d+[A-Z]?)/);
                const lineName = lineMatch ? lineMatch[1] : null;

                if (!lineName) {
                    return res.status(400).json({ message: `Could not identify Route Line from filename: ${filename}. Ensure filename contains "LINEA X" or starts with Number.` });
                }

                // 2. Identify/Create Route
                let route = await prisma.route.findFirst({ where: { name: lineName } });
                if (!route) {
                    console.log(`[LegacyImport] Creating new Route: ${lineName}`);
                    route = await prisma.route.create({
                        data: {
                            tenantId: 1,
                            name: lineName,
                            description: `Imported from ${filename}`,
                            status: 'ACTIVE'
                        }
                    });
                }

                // 3. Identify/Create Variant
                // Clean filename to get descriptive part (e.g. "GEANT" from "CARTON 306 GEANT")
                let variantNameCandidate = filename
                    .replace(/\.XLSX|\.CSV|\.XLS/g, '')
                    .replace(/CARTON/g, '')
                    .replace(/BOLETIN/g, '')
                    .replace(/LINEA/g, '')
                    .replace(/LÍNEA/g, '')
                    .replace(new RegExp(`\\b${lineName}\\b`, 'g'), '') // Remove line number
                    .replace(/[-_]/g, ' ')
                    .trim();

                if (variantNameCandidate.length < 2) variantNameCandidate = "PRINCIPAL";

                let variant = await prisma.routeVariant.findFirst({
                    where: {
                        routeId: route.id,
                        OR: [
                            { name: { contains: variantNameCandidate } },
                            { destination: { contains: variantNameCandidate } }
                        ]
                    }
                });

                if (!variant) {
                    console.log(`[LegacyImport] Creating new Variant for ${lineName}: ${variantNameCandidate}`);
                    variant = await prisma.routeVariant.create({
                        data: {
                            route: { connect: { id: route.id } },
                            name: variantNameCandidate,
                            origin: 'IMPORT',
                            destination: variantNameCandidate,
                            description: 'Auto-created from File Import',
                            status: 'ACTIVE'
                        }
                    });
                }

                const variantId = variant.id;

                // 1. Create Sequences (Columns)
                const firstRow = parsed.data[0];
                const columns = Object.keys(firstRow).filter(k => k !== 'Servicio' && k.toUpperCase() !== 'SALE' && k !== 'T/Día' && k !== 'T/DÍA');

                // Check if sequences exist, if not create
                const existingSequences = await prisma.routeSequence.findMany({ where: { variantId } });
                if (existingSequences.length === 0) {
                    for (let i = 0; i < columns.length; i++) {
                        const stopName = columns[i];
                        await prisma.routeSequence.create({
                            data: { variantId, stopName, order: i }
                        });
                    }
                }

                const sequences = await prisma.routeSequence.findMany({ where: { variantId }, orderBy: { order: 'asc' } });

                // 2. Create Trips & Times
                let tripCount = 0;
                for (const row of parsed.data) {
                    const serviceId = row['Servicio'] || row['Scio'] || 'UNKNOWN';
                    const startTime = row['Sale'] || '';
                    if (!startTime) continue;

                    const trip = await prisma.tripSchedule.create({
                        data: {
                            variantId,
                            serviceId: String(serviceId),
                            dayType: 'HABIL', // Default, should parse from filename/row
                            startTime: String(startTime)
                        }
                    });

                    // Create Times
                    for (const seq of sequences) {
                        const time = row[seq.stopName];
                        if (time) {
                            await prisma.tripTime.create({
                                data: {
                                    tripScheduleId: trip.id,
                                    sequenceId: seq.id,
                                    time: String(time)
                                }
                            });
                        }
                    }
                    tripCount++;
                }
                return res.json({ success: true, message: `Imported ${tripCount} trips for Variant ID ${variantId}` });

            } else if (parsed.type === 'DAILY') {
                // "Coches y Servicios"
                // Map to Shift? Or creating real Shifts?
                // For now, let's assume we map to generic Shift structure
                let count = 0;
                for (const row of parsed.data) {
                    const carNum = row['Coche'] ? String(row['Coche']) : null;
                    const serviceNum = row['Scio.'] || row['Servicio'];
                    const lineName = row['Línea'];
                    const sale = row['Sale'];

                    if (carNum && serviceNum) {
                        // Find vehicle
                        const vehicle = await prisma.vehicle.findFirst({ where: { internalNumber: carNum } });

                        // Create Shift (Simple version)
                        await prisma.shift.create({
                            data: {
                                tenantId: 1,
                                categoryId: 1, // Default
                                serviceNumber: String(serviceNum),
                                date: new Date(), // TODAY
                                time: String(sale || '00:00'),
                                line: String(lineName || '???'),
                                carNumber: carNum,
                                totalValue: 0,
                                createdBy: 1, // System default
                                status: 'CONFIRMED'
                            }
                        });
                        count++;
                    }
                }
                return res.json({ success: true, message: `Daily Allocation: ${count} shifts created.` });
            }

            return res.json({ message: 'Persistence not implemented for this type yet.' });

        } catch (error) {
            console.error(error);
            res.status(500).json({ message: String(error) });
        }
    },

    audit: async (req: Request, res: Response) => {
        try {
            const report = await SystemAudit();
            res.header('Content-Type', 'text/markdown');
            res.send(report);
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: String(error) });
        }
    }
};
