import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const maintenanceController = {
    // Create a new report
    createReport: async (req: Request, res: Response) => {
        try {
            const {
                vehicleId,
                departmentId,
                title,
                description,
                priority,
                photoUrl
            } = req.body;

            const userId = (req as any).user.id;

            const report = await prisma.maintenanceReport.create({
                data: {
                    vehicleId: Number(vehicleId),
                    reporterId: userId,
                    departmentId: departmentId ? Number(departmentId) : null,
                    title,
                    description,
                    priority: priority || 'NORMAL',
                    photoUrl,
                    status: 'PENDING'
                },
                include: {
                    vehicle: true,
                    department: true,
                    reporter: true
                }
            });

            // Log creation
            await prisma.maintenanceLog.create({
                data: {
                    reportId: report.id,
                    userId,
                    action: 'CREATE',
                    description: 'Reporte creado'
                }
            });

            res.status(201).json(report);
        } catch (error) {
            console.error('Error creating report:', error);
            res.status(500).json({ message: 'Error al crear reporte' });
        }
    },

    // Get Reports (with filters)
    getReports: async (req: Request, res: Response) => {
        try {
            const { status, vehicleId, departmentId, myReports } = req.query;
            const userId = (req as any).user.id;

            const where: any = {};

            if (status) where.status = status;
            if (vehicleId) where.vehicleId = Number(vehicleId);
            if (departmentId) where.departmentId = Number(departmentId);

            // Filter for specific user if requested
            if (myReports === 'true') {
                where.reporterId = userId;
            }

            const reports = await prisma.maintenanceReport.findMany({
                where,
                include: {
                    vehicle: true,
                    reporter: {
                        select: { id: true, firstName: true, lastName: true, internalNumber: true }
                    },
                    department: true,
                    logs: {
                        orderBy: { createdAt: 'desc' },
                        take: 1
                    }
                },
                orderBy: { createdAt: 'desc' }
            });

            res.json(reports);
        } catch (error) {
            console.error('Error fetching reports:', error);
            res.status(500).json({ message: 'Error al obtener reportes' });
        }
    },

    // Update Status / Add Log
    updateReport: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const { status, resolutionNote, newDepartmentId, photoUrl } = req.body;
            const userId = (req as any).user.id;

            const existingReport = await prisma.maintenanceReport.findUnique({ where: { id: Number(id) } });
            if (!existingReport) return res.status(404).json({ message: 'Reporte no encontrado' });

            // Build update data
            const updateData: any = {};
            const logData: any = {
                reportId: Number(id),
                userId,
                action: 'UPDATE',
                description: resolutionNote || 'Actualización de estado'
            };

            if (status && status !== existingReport.status) {
                updateData.status = status;
                logData.action = 'STATUS_CHANGE';
                logData.newStatus = status;
                logData.description = resolutionNote ? `${status}: ${resolutionNote}` : `Estado cambiado a ${status}`;
            }

            if (newDepartmentId) {
                updateData.departmentId = Number(newDepartmentId);
                logData.action = 'TRANSFER';
                logData.description = `Transferido a otro departamento`;
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.maintenanceReport.update({
                    where: { id: Number(id) },
                    data: updateData
                });
            }

            // Create log
            await prisma.maintenanceLog.create({
                data: {
                    ...logData,
                    photoUrl: photoUrl || null
                }
            });

            const updatedReport = await prisma.maintenanceReport.findUnique({
                where: { id: Number(id) },
                include: { vehicle: true, logs: true, department: true }
            });

            res.json(updatedReport);

        } catch (error) {
            console.error('Error updating report:', error);
            res.status(500).json({ message: 'Error al actualizar reporte' });
        }
    },

    getReportDetails: async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const report = await prisma.maintenanceReport.findUnique({
                where: { id: Number(id) },
                include: {
                    vehicle: true,
                    reporter: true,
                    department: true,
                    logs: {
                        include: { user: true },
                        orderBy: { createdAt: 'desc' }
                    }
                }
            });
            if (!report) return res.status(404).json({ message: 'Reporte no encontrado' });
            res.json(report);
        } catch (error) {
            res.status(500).json({ message: 'Error' });
        }
    }
};
