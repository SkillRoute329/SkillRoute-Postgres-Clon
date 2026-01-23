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
        const tenantId = user.tenantId;

        // 1. Leer archivo desde buffer
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];

        // 2. Convertir a JSON
        const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

        if (rawData.length === 0) {
            return res.status(400).json({ message: 'El archivo está vacío.' });
        }

        // 3. Validar Cabeceras
        const uploadedHeaders = Object.keys(rawData[0]);
        const missingColumns = EXPECTED_COLUMNS.filter(col => !uploadedHeaders.includes(col));

        if (missingColumns.length > 0) {
            return res.status(400).json({
                message: 'Formato de archivo inválido. Faltan columnas.',
                missingColumns,
                expected: EXPECTED_COLUMNS
            });
        }

        // 4. Procesar y Validar filas
        const errors: any[] = [];
        const validRows: any[] = [];

        // Cache seasons to minimize DB calls
        const seasonCache = new Map<string, number>();

        for (let i = 0; i < rawData.length; i++) {
            const row = rawData[i];
            const rowNumber = i + 2; // +1 header, +1 1-based index

            // Validaciones básicas
            if (!row.Servicio || !row.Temporada || !row.TipoDia) {
                errors.push({ row: rowNumber, error: 'Faltan datos obligatorios (Servicio, Temporada, TipoDia)' });
                continue;
            }

            // Resolver Season ID
            let seasonId = seasonCache.get(row.Temporada);
            if (!seasonId) {
                const season = await prisma.season.findFirst({
                    where: { tenantId, name: row.Temporada }
                });

                if (season) {
                    seasonId = season.id;
                    seasonCache.set(row.Temporada, seasonId);
                } else {
                    // Opcional: Crear temporada si no existe? Por ahora error.
                    errors.push({ row: rowNumber, error: `Temporada '${row.Temporada}' no encontrada en el sistema.` });
                    continue;
                }
            }

            // Preparar objeto para insert
            validRows.push({
                tenantId,
                seasonId,
                serviceCode: String(row.Servicio),
                serviceNumber: String(row.Servicio), // Legacy
                line: String(row.Linea || 'A DEFINIR'),
                vehicleType: String(row.TipoCoche || 'Convencional'),
                dayType: String(row.TipoDia).toUpperCase(),
                startTime: String(row.HoraInicio || '00:00'),
                endTime: String(row.HoraFin || '00:00'),
                routeData: JSON.stringify({ note: "Importado desde Excel" })
            });
        }

        if (errors.length > 0 && validRows.length === 0) {
            return res.status(400).json({ message: 'Error en validación de datos', errors });
        }

        // 5. Insertar Datos (Upsert)
        // Prisma createMany no soporta upsert directo, lo haremos iterativo o delete+create si se prefiere reemplazar.
        // Para seguridad, usaremos upsert individual o transaction.

        let processedCount = 0;

        await prisma.$transaction(async (tx) => {
            for (const item of validRows) {
                // Check if exists to avoid "where" type issues if types are outdated
                const existing = await tx.serviceDefinition.findFirst({
                    where: {
                        tenantId: item.tenantId,
                        seasonId: item.seasonId,
                        serviceCode: item.serviceCode,
                        dayType: item.dayType
                    }
                });

                if (existing) {
                    await tx.serviceDefinition.update({
                        where: { id: existing.id },
                        data: {
                            line: item.line,
                            vehicleType: item.vehicleType,
                            startTime: item.startTime,
                            endTime: item.endTime,
                            routeData: item.routeData
                        }
                    });
                } else {
                    await tx.serviceDefinition.create({
                        data: item
                    });
                }

                processedCount++;
            }
        });

        res.json({
            message: 'Importación completada',
            totalRows: rawData.length,
            processed: processedCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('Import Error:', error);
        // Devolvemos el error real sin censura para debug inmediato
        res.status(400).json({
            message: 'Error CRÍTICO al procesar el archivo',
            error: error.message || String(error),
            stack: error.stack
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
