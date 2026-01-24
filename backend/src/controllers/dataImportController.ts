import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

// Estructura esperada del Excel para Servicios
const EXPECTED_COLUMNS = [
    'Servicio',        // serviceCode / serviceNumber
    'Linea',           // line
    'HoraInicio',      // startTime
    'HoraFin',         // endTime
    'TipoCoche',       // vehicleType
    'TipoDia',         // dayType (HABIL, SABADO, DOMINGO)
    'Temporada'        // Name of season (e.g. "VERANO 2026")
];

export const uploadServiceData = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No se ha subido ningún archivo.' });
        }

        const user = (req as any).user;
        const tenantId = user?.tenantId || 1;

        // 1. Leer archivo desde buffer (Permisivo total)
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 2. Convertir a JSON
        const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

        if (!rawData || rawData.length === 0) {
            return res.status(400).json({ message: 'El archivo está vacío o no se pudo leer.' });
        }

        console.log(`[NUCLEAR IMPORT] Processing ${rawData.length} rows for Tenant ${tenantId}`);

        // 4. Procesar y Validar filas (Mínimo necesario)
        let processedCount = 0;
        const errors: any[] = [];

        // Asegurar que exista una temporada por defecto si no se especifica
        let defaultSeason = await prisma.season.findFirst({ where: { tenantId, isActive: true } });
        if (!defaultSeason) {
            defaultSeason = await prisma.season.create({
                data: {
                    tenantId,
                    name: "Importación de Emergencia",
                    startDate: new Date(),
                    isActive: true
                }
            });
        }

        for (const row of rawData) {
            try {
                const serviceCode = String(row.Servicio || row.serviceCode || row.id || Math.random());
                const dayType = String(row.TipoDia || row.dayType || 'HABIL').toUpperCase();

                // Upsert manual para evitar fallos de constraint
                const existing = await (prisma as any).serviceDefinition.findFirst({
                    where: {
                        tenantId: tenantId,
                        seasonId: defaultSeason.id,
                        serviceCode: serviceCode,
                        dayType: dayType
                    }
                });

                const dataPayload = {
                    tenantId: tenantId,
                    seasonId: defaultSeason.id,
                    serviceCode: serviceCode,
                    serviceNumber: serviceCode,
                    line: String(row.Linea || row.line || 'S/N'),
                    dayType: dayType,
                    vehicleType: String(row.TipoCoche || row.vehicleType || 'Convencional'),
                    startTime: String(row.HoraInicio || row.startTime || '00:00'),
                    endTime: String(row.HoraFin || row.endTime || '00:00'),
                    routeData: JSON.stringify(row)
                };

                if (existing) {
                    await (prisma as any).serviceDefinition.update({
                        where: { id: existing.id },
                        data: dataPayload
                    });
                } else {
                    await (prisma as any).serviceDefinition.create({
                        data: dataPayload
                    });
                }
                processedCount++;
            } catch (e: any) {
                errors.push({ row, error: e.message });
            }
        }

        res.json({
            message: 'Importación Nuclear Completada',
            total: rawData.length,
            success: processedCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('CRITICAL Import Error:', error);
        res.status(500).json({
            message: 'ERROR NUCLEAR EN IMPORTACIÓN',
            error: error.message || String(error)
        });
    }
};

export const downloadTemplate = async (req: Request, res: Response) => {
    try {
        const wb = XLSX.utils.book_new();
        const wsData = [
            EXPECTED_COLUMNS,
            ['1001', '300', '06:00', '14:00', 'Hibrido', 'HABIL', 'VERANO 2026'] // Ejemplo
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=plantilla_servicios.xlsx');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: 'Error al generar plantilla' });
    }
};
