
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// WHITELIST DE ENTIDADES PERMITIDAS
// Mapea el nombre de la URL al nombre del modelo en Prisma (camelCase)
const ALLOWED_ENTITIES: Record<string, string> = {
    'users': 'user',
    'vehicles': 'vehicle',
    'stock': 'vehicle', // Alias for STOCK entity
    'departments': 'department',
    'roles': 'jobRole', // Corrected from 'role' to 'jobRole' based on schema
    'penalties': 'penaltyRule', // Likely mapped to PenaltyRule
    'maintenance': 'maintenanceReport', // Likely mapped to MaintenanceReport
    'service-definitions': 'serviceDefinition',
    'services': 'serviceDefinition', // Alias for SERVICES entity
    'rotation': 'serviceDefinition', // Alias for ROTATION entity (Uses same table but different columns)
    'bulletins': 'serviceDefinition', // Alias for BULLETINS entity
    'roadAlerts': 'roadAlert', // Mapped to RoadAlert
    'plannedDetours': 'plannedDetour', // Mapped to PlannedDetour
    'routes': 'route',
    'routeVariants': 'routeVariant',
    'radars': 'radar',
    'tariffs': 'tariffZone',
    'parts': 'part'
};

export const UniversalController = {
    list: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];

            if (!modelName) {
                return res.status(400).json({ message: `Entity '${entity}' not allowed or unknown.` });
            }

            // Pagination params
            const page = Number(req.query.page) || 1;
            const pageSize = Number(req.query.limit) || 50;
            const skip = (page - 1) * pageSize;

            // Dynamic Prisma Call
            // @ts-ignore - Prisma dynamic access
            const delegate = prisma[modelName];

            if (!delegate) {
                return res.status(500).json({ message: `Prisma model '${modelName}' not found.` });
            }

            const [data, total] = await Promise.all([
                delegate.findMany({
                    take: pageSize,
                    skip: skip,
                    orderBy: { id: 'desc' } // Default sort, assumes ID exists
                }),
                delegate.count()
            ]);

            res.json({
                data,
                meta: { total, page, pageSize }
            });

        } catch (error) {
            console.error('Universal List Error:', error);
            res.status(500).json({ message: 'Error fetching data', error: String(error) });
        }
    },

    import: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            let { data } = req.body; // Array of objects

            if (!modelName || !Array.isArray(data)) {
                return res.status(400).json({ message: 'Formato inválido. Debe ser un array de datos.' });
            }

            console.log(`[IMPORT] Recibiendo ${data.length} registros para entidad: ${entity}`);

            // LIMPIEZA Y NORMALIZACIÓN FLEXIBLE DE DATOS
            const cleanedData = [];
            const errors = [];

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const cleanRow: any = {};

                try {
                    // SPECIAL HANDLING FOR USERS
                    if (modelName === 'user') {
                        // Campos obligatorios con valores por defecto inteligentes
                        cleanRow.internalNumber = String(row.internalNumber || row.legajo || row.numero || row.id || `AUTO-${Date.now()}-${i}`);
                        cleanRow.firstName = String(row.firstName || row.nombre || row.first_name || 'Sin').trim();
                        cleanRow.lastName = String(row.lastName || row.apellido || row.last_name || 'Nombre').trim();
                        cleanRow.fullName = `${cleanRow.firstName} ${cleanRow.lastName}`;

                        // Password handling
                        if (row.password || row.contraseña || row.pass) {
                            cleanRow.passwordHash = await bcrypt.hash(String(row.password || row.contraseña || row.pass), 10);
                        } else {
                            cleanRow.passwordHash = await bcrypt.hash('123456', 10);
                        }

                        // Campos opcionales
                        cleanRow.email = row.email || row.correo || null;
                        cleanRow.phoneNumber = row.phoneNumber || row.telefono || row.phone || null;
                        cleanRow.ci = row.ci || row.cedula || row.dni || null;
                        cleanRow.role = row.role || row.rol || 'User';
                        cleanRow.tenantId = Number(row.tenantId || 1);
                        cleanRow.isActive = row.isActive !== undefined ? Boolean(row.isActive) : true;

                        // Foreign keys opcionales
                        if (row.departmentId) cleanRow.departmentId = Number(row.departmentId);
                        if (row.jobRoleId) cleanRow.jobRoleId = Number(row.jobRoleId);
                        if (row.assignedVehicleId) cleanRow.assignedVehicleId = Number(row.assignedVehicleId);
                    }
                    // SPECIAL HANDLING FOR VEHICLES
                    else if (modelName === 'vehicle') {
                        cleanRow.internalNumber = String(row.internalNumber || row.numero || row.coche || `VEH-${i}`);
                        cleanRow.plate = row.plate || row.matricula || row.patente || null;
                        cleanRow.make = row.make || row.marca || null;
                        cleanRow.model = row.model || row.modelo || null;
                        cleanRow.year = row.year ? Number(row.year) : null;
                        cleanRow.status = row.status || row.estado || 'OPERATIONAL';
                        cleanRow.tenantId = Number(row.tenantId || 1);
                        cleanRow.isActive = row.isActive !== undefined ? Boolean(row.isActive) : true;
                    }
                    // GENERIC HANDLING FOR OTHER ENTITIES
                    else {
                        // Copiar solo campos que existen en el row, ignorando extras
                        Object.keys(row).forEach(key => {
                            if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
                                cleanRow[key] = row[key];
                            }
                        });

                        // Asegurar tenantId si no existe
                        if (!cleanRow.tenantId) cleanRow.tenantId = 1;
                    }

                    cleanedData.push(cleanRow);
                } catch (rowError: any) {
                    errors.push({ row: i + 1, error: rowError.message });
                    console.error(`[IMPORT] Error en fila ${i + 1}:`, rowError);
                }
            }

            if (cleanedData.length === 0) {
                return res.status(400).json({
                    message: 'No se pudo procesar ningún registro válido.',
                    errors
                });
            }

            console.log(`[IMPORT] ${cleanedData.length} registros limpiados y listos para importar.`);

            // @ts-ignore
            const delegate = prisma[modelName];

            // Bulk create con skipDuplicates
            const result = await delegate.createMany({
                data: cleanedData,
                skipDuplicates: true
            });

            const response: any = {
                message: `✅ Importación exitosa: ${result.count} registros creados.`,
                count: result.count,
                processed: cleanedData.length,
                total: data.length
            };

            if (errors.length > 0) {
                response.warnings = `${errors.length} filas tuvieron errores y fueron omitidas.`;
                response.errors = errors;
            }

            res.json(response);

        } catch (error: any) {
            console.error('Universal Import Error:', error);
            res.status(500).json({
                message: 'Error en la importación',
                error: error.message || String(error),
                hint: 'Verifique que el Excel tenga al menos las columnas básicas requeridas.'
            });
        }
    },

    // Basic CRUD support for the UI editor
    create: async (req: Request, res: Response) => {
        try {
            const { entity } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            // @ts-ignore
            const result = await prisma[modelName].create({ data: req.body });
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    },

    update: async (req: Request, res: Response) => {
        try {
            const { entity, id } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            // @ts-ignore
            const result = await prisma[modelName].update({
                where: { id: Number(id) },
                data: req.body
            });
            res.json(result);
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    },

    delete: async (req: Request, res: Response) => {
        try {
            const { entity, id } = req.params;
            const modelName = ALLOWED_ENTITIES[entity];
            const numericId = Number(id);

            // SPECIAL CASCADE LOGIC
            if (modelName === 'route') {
                const route = await prisma.route.findUnique({ where: { id: numericId } });
                if (route) {
                    // 1. Delete associated RoadAlerts
                    await prisma.roadAlert.deleteMany({
                        where: { affectedLine: route.name }
                    });
                }
            }

            // @ts-ignore
            await prisma[modelName].delete({ where: { id: numericId } });
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ message: String(error) });
        }
    }
};
