import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import bcrypt from 'bcryptjs';

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
        const { type } = req.query;
        const wb = XLSX.utils.book_new();

        if (type === 'employees') {
            const cols = ['Legajo', 'CI', 'Nombre', 'Apellido', 'Email', 'Cargo', 'Departamento', 'Rol'];
            const example = ['101', '12345678', 'Juan', 'Perez', 'juan@ucot.com', 'Chofer', 'Operativa', 'User'];
            const ws = XLSX.utils.aoa_to_sheet([cols, example]);
            XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Empleados');
        } else {
            const ws = XLSX.utils.aoa_to_sheet([EXPECTED_COLUMNS, ['1001', '300', '06:00', '14:00', 'Hibrido', 'HABIL', 'VERANO 2026']]);
            XLSX.utils.book_append_sheet(wb, ws, 'Plantilla Servicios');
        }

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=plantilla_${type || 'servicios'}.xlsx`);
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ message: 'Error al generar plantilla' });
    }
};

// --- RRHH NUCLEAR IMPORT ---
export const uploadEmployeeData = async (req: Request, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No se ha subido ningún archivo.' });

        const user = (req as any).user;
        const tenantId = user?.tenantId || 1;

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const data: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        let successCount = 0;
        const errors = [];

        // Pre-fetch/cache for performance
        const departments = await prisma.department.findMany({ where: { tenantId } });
        const roles = await prisma.jobRole.findMany({ where: { tenantId } });

        for (const row of data) {
            try {
                const ci = String(row.CI || row.ci || row.Documento || '').replace(/\D/g, '');
                const internalNumber = String(row.Legajo || row.internalNumber || row.ID || ci);
                const firstName = String(row.Nombre || row.firstName || 'S/N');
                const lastName = String(row.Apellido || row.lastName || '');
                const deptName = String(row.Departamento || row.Area || 'Administración');
                const roleName = String(row.Cargo || row.Posicion || 'Empleado');
                const sysRole = String(row.Rol || row.role || 'User');

                if (!ci) throw new Error("CI es obligatoria");

                // 1. Ensure Department
                let dept = departments.find(d => d.name === deptName);
                if (!dept) {
                    dept = await prisma.department.create({ data: { tenantId, name: deptName } });
                    departments.push(dept);
                }

                // 2. Ensure JobRole
                let jobRole = roles.find(r => r.name === roleName && r.departmentId === dept!.id);
                if (!jobRole) {
                    jobRole = await prisma.jobRole.create({ data: { tenantId, departmentId: dept.id, name: roleName } });
                    roles.push(jobRole);
                }

                const hashedPassword = await bcrypt.hash(ci, 10);

                // 3. Upsert User
                const upsertedUser = await prisma.user.upsert({
                    where: { tenantId_internalNumber: { tenantId, internalNumber } },
                    update: {
                        firstName, lastName, fullName: `${firstName} ${lastName}`,
                        ci, departmentId: dept.id, jobRoleId: jobRole.id, role: sysRole
                    },
                    create: {
                        tenantId, internalNumber, firstName, lastName, fullName: `${firstName} ${lastName}`,
                        ci, departmentId: dept.id, jobRoleId: jobRole.id, role: sysRole,
                        passwordHash: hashedPassword
                    }
                });

                // 4. Ensure Employee record
                await prisma.employee.upsert({
                    where: { ci },
                    update: { firstName, lastName, position: roleName, userId: upsertedUser.id },
                    create: { ci, firstName, lastName, position: roleName, userId: upsertedUser.id }
                });

                successCount++;
            } catch (e: any) {
                errors.push({ row, error: e.message });
            }
        }

        res.json({ message: 'Importación de RRHH Completada', total: data.length, success: successCount, errors });
    } catch (error: any) {
        res.status(500).json({ message: 'Error nuclear en importación de RRHH', error: error.message });
    }
};

export const exportEmployeeData = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const users = await prisma.user.findMany({
            where: { tenantId },
            include: { department: true, jobRole: true, employee: true }
        });

        const data = users.map(u => ({
            Legajo: u.internalNumber,
            CI: u.ci || u.employee?.ci || '',
            Nombre: u.firstName,
            Apellido: u.lastName,
            Email: u.email || '',
            Telefono: u.phoneNumber || '',
            Cargo: u.jobRole?.name || u.employee?.position || '',
            Departamento: u.department?.name || '',
            Sindicato: u.metadata ? (u.metadata as any).unionMember : 'N/A',
            Status: u.isActive ? 'ACTIVO' : 'INACTIVO'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'EMPLEADOS UCOT');

        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=export_empleados.xlsx');
        res.send(buffer);
    } catch (e) {
        res.status(500).json({ message: 'Error al exportar' });
    }
};
