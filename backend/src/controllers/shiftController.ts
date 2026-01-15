import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createNotification } from './notificationController';
import pool from '../db'; // Keeping pool for complex legacy queries (Balances/Payouts) temporarily

const prisma = new PrismaClient();

export const getAllShifts = async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string);
        const limit = parseInt(req.query.limit as string) || 20;
        const tenantId = (req as any).user.tenantId;

        const shouldPaginate = !isNaN(page) && page > 0;

        // Count for pagination
        const totalCount = shouldPaginate
            ? await prisma.shift.count({ where: { tenantId, deletedAt: null } })
            : 0;

        // Fetch Shifts with Relations
        const shifts = await prisma.shift.findMany({
            where: {
                tenantId,
                deletedAt: null
            },
            include: {
                category: { select: { name: true } },
                creator: { select: { internalNumber: true, firstName: true, lastName: true, fullName: true } },
                assignee: { select: { internalNumber: true, firstName: true, lastName: true, fullName: true, phoneNumber: true } }
            },
            orderBy: { createdAt: 'desc' },
            take: shouldPaginate ? limit : undefined,
            skip: shouldPaginate ? (page - 1) * limit : undefined
        });

        // Map to flat structure expected by frontend (preserving compatibility)
        const formattedShifts = shifts.map(s => ({
            ...s,
            categoryName: s.category?.name,
            creatorName: s.creator?.fullName,
            creatorInternalNumber: s.creator?.internalNumber,
            assigneeName: s.assignee?.fullName,
            assigneeInternalNumber: s.assignee?.internalNumber,
            assigneePhone: s.assignee?.phoneNumber
        }));

        if (shouldPaginate) {
            res.json({
                data: formattedShifts,
                meta: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount
                }
            });
        } else {
            res.json(formattedShifts);
        }

    } catch (error) {
        console.error('Shift Get Error:', error);
        res.status(500).json({ message: 'Error al obtener turnos', details: String(error) });
    }
};

export const createShift = async (req: Request, res: Response) => {
    const {
        categoryId, serviceNumber, date, time, line, relief,
        carNumber, extraHours, tip, tipValue, totalValue,
        transformaFacil, cedingInternalNumber
    } = req.body;

    try {
        const catId = Number(categoryId);
        if (isNaN(catId)) {
            return res.status(400).json({ message: 'Categoría inválida' });
        }

        const user = (req as any).user;
        let createdBy = user?.id;

        // Strict Tenant Check
        const tenantId = user?.tenantId;
        if (!tenantId) {
            return res.status(401).json({ message: 'Error de sesión: Tenant ID no encontrado.' });
        }

        // ADMIN OVERRIDE: If Admin assigns a "ceding user"
        if ((user?.role === 'Admin' || user?.role === 'SuperAdmin') && cedingInternalNumber) {
            const cedingUser = await prisma.user.findFirst({
                where: { internalNumber: cedingInternalNumber, tenantId }
            });

            if (cedingUser) {
                createdBy = cedingUser.id;
            } else {
                return res.status(404).json({ message: `No se encontró el usuario con interno ${cedingInternalNumber}` });
            }
        }

        if (!date || !req.body.endTime) {
            return res.status(400).json({ message: 'Fecha y Hora Fin requeridas' });
        }

        let shiftDate = date;
        if (date.includes('T')) {
            shiftDate = new Date(date).toISOString(); // Prisma handles ISO strings well
        } else {
            // Ensure valid ISO for Prisma
            shiftDate = new Date(date).toISOString();
        }

        const initialStatus = (user?.role === 'Admin' || user?.role === 'SuperAdmin') ? 'Public' : 'Created';

        const shift = await prisma.shift.create({
            data: {
                tenantId,
                categoryId: catId,
                serviceNumber: serviceNumber || '',
                date: shiftDate,
                time: time || '00:00',
                endTime: req.body.endTime || '',
                line: line || '',
                relief: relief || '',
                carNumber: carNumber || '',
                extraHours: Number(extraHours) || 0,
                tip: Boolean(tip),
                tipValue: Number(tipValue) || 0,
                totalValue: Number(totalValue) || 0,
                transformaFacil: Boolean(transformaFacil),
                createdBy: Number(createdBy),
                status: initialStatus
            }
        });

        res.status(201).json(shift);

    } catch (error) {
        console.error('Shift Create Error Details:', error);
        res.status(500).json({ message: 'Error al crear turno', details: String(error) });
    }
};

// --- Refactored updateShiftStatus with Prisma ---
export const updateShiftStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, assignedTo, transformaFacilDiscount } = req.body;

    try {
        const shiftId = Number(id);
        const user = (req as any).user;
        const tenantId = user.tenantId;

        // Fetch current shift
        const currentShift = await prisma.shift.findUnique({
            where: { id: shiftId }
        });

        if (!currentShift) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }

        // Authorization / Conflict Check
        if (assignedTo !== undefined) {
            // Cannot overtake a shift already assigned to someone else, unless Admin
            if (currentShift.assignedTo && currentShift.assignedTo !== Number(assignedTo) && user.role !== 'Admin') {
                return res.status(409).json({ message: 'Este turno ya ha sido tomado por otro usuario.' });
            }
        }

        // Prepare Update Data
        const updateData: any = {
            status,
            updatedAt: new Date()
        };

        if (assignedTo !== undefined) updateData.assignedTo = Number(assignedTo);
        if (transformaFacilDiscount !== undefined) updateData.transformaFacilDiscount = Number(transformaFacilDiscount);

        const updatedShift = await prisma.shift.update({
            where: { id: shiftId },
            data: updateData
        });

        // --- Notifications & Side Effects ---

        // 1. Approved/Public
        if (status === 'Public' && currentShift.status !== 'Public') {
            await createNotification(updatedShift.createdBy, `Turno Aprobado: Tu turno #${updatedShift.serviceNumber} ha sido aprobado y publicado.`);
        }

        // 2. Assigned
        if (status === 'Assigned' && assignedTo) {
            const isReassignment = currentShift.assignedTo && currentShift.assignedTo !== Number(assignedTo);

            if (isReassignment) {
                // await createNotification(currentShift.assignedTo, ...); // Optional
            } else if (!currentShift.assignedTo) {
                // Notify Assignee
                await createNotification(Number(assignedTo), `Nuevo Turno Asignado: Se te ha asignado el turno servicio #${updatedShift.serviceNumber}.`);
                // Notify Creator
                await createNotification(updatedShift.createdBy, `Turno Tomado: Tu turno #${updatedShift.serviceNumber} ha sido tomado por otro usuario.`);
            }

            // WhatsApp Notification
            try {
                const assignee = await prisma.user.findUnique({
                    where: { id: Number(assignedTo) }
                });

                if (assignee && assignee.phoneNumber) {
                    const category = await prisma.shiftCategory.findUnique({
                        where: { id: updatedShift.categoryId }
                    });
                    const categoryName = category?.name || '';

                    const { whatsAppService } = await import('../services/whatsappService');

                    // Simple text message
                    const message = `👋 Hola ${assignee.firstName || 'Chofer'}, turno asignado:\n` +
                        `📅 ${new Date(updatedShift.date).toLocaleDateString()} - ⏰ ${updatedShift.time} Hs\n` +
                        `🚌 Coche: ${updatedShift.carNumber}\n` +
                        `💵 Valor: $${Number(updatedShift.totalValue).toLocaleString()}\n` +
                        `Categoría: ${categoryName}`;

                    // Fire and forget
                    whatsAppService.sendMessage(assignee.phoneNumber, message).catch(e => console.error("WA Send Error:", e));
                }
            } catch (waError) {
                console.error('Error auto-sending WhatsApp:', waError);
            }
        }

        res.json(updatedShift);

    } catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar estado', details: String(error) });
    }
};

export const deleteShift = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const tenantId = (req as any).user.tenantId;

        // Soft delete using Prisma
        // Verify existence and tenant first if strictly needed, or relies on unique ID.
        // Prisma updates throw if not found.

        // Using updateMany ensures tenant check implicitly if we wanted, 
        // but id is unique. Let's stick to update safely.

        const result = await prisma.shift.updateMany({
            where: {
                id: Number(id),
                tenantId
            },
            data: {
                deletedAt: new Date()
            }
        });

        if (result.count === 0) {
            return res.status(404).json({ message: 'Turno no encontrado o no autorizado' });
        }

        res.json({ message: 'Turno eliminado correctamente' });
    } catch (error) {
        console.error('Shift Delete Error:', error);
        res.status(500).json({ message: 'Error al eliminar turno' });
    }
};

export const updateShift = async (req: Request, res: Response) => {
    const { id } = req.params;
    const {
        categoryId, serviceNumber, date, time, line, relief,
        carNumber, extraHours, tip, tipValue, totalValue,
        transformaFacil, status, endTime
    } = req.body;

    try {
        const shiftId = Number(id);
        let shiftDate = date;
        if (date && typeof date === 'string') {
            shiftDate = new Date(date).toISOString();
        }

        const updatedShift = await prisma.shift.update({
            where: { id: shiftId },
            data: {
                categoryId: Number(categoryId),
                serviceNumber,
                date: shiftDate,
                time,
                endTime,
                line,
                relief,
                carNumber,
                extraHours: Number(extraHours),
                tip: Boolean(tip),
                tipValue: Number(tipValue),
                totalValue: Number(totalValue),
                transformaFacil: Boolean(transformaFacil),
                status,
                updatedAt: new Date()
            }
        });

        res.json(updatedShift);
    } catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar turno', details: String(error) });
    }
};

export const getBalances = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;

        // Fetch users to map results
        const users = await prisma.user.findMany({
            where: { tenantId, role: { not: 'SuperAdmin' } },
            orderBy: { internalNumber: 'asc' },
            select: { id: true, internalNumber: true, firstName: true, lastName: true }
        });

        // 1. Shifts TAKEN (Debts - Money I owe because I worked the shift but didn't pay the owner yet?) 
        // Logic: assignedTo user owes money to createdBy user? 
        // Usually: "Tomados" = shifts I performed. "Cedidos" = shifts I gave away.
        // Balance = Tomados - Cedidos is a rough approximation. 
        // Let's replicate the SQL logic with safe aggregations.

        // Aggregate TOMADOS (AssignedTo)
        const tomadosAgg = await prisma.shift.groupBy({
            by: ['assignedTo'],
            where: {
                tenantId,
                status: { in: ['Assigned', 'Completed'] },
                isPaid: false,
                deletedAt: null,
                assignedTo: { not: null }
            },
            _sum: { totalValue: true }
        });

        // Aggregate CEDIDOS (CreatedBy, where assigned != created)
        const cedidosAgg = await prisma.shift.groupBy({
            by: ['createdBy'],
            where: {
                tenantId,
                status: { in: ['Assigned', 'Completed'] },
                isPaid: false,
                deletedAt: null,
                assignedTo: { not: null }
                // AND assignedTo != createdBy logic needs post-filtering or raw query if strict on DB side.
                // Prisma doesn't support field-comparison in 'where' easily.
                // For simplicity/performance, let's fetch raw or filter in memory if dataset small, 
                // OR use the raw query but fix the casing.
            },
            _sum: { totalValue: true }
        });

        // Since "assignedTo != createdBy" is hard in Prisma core without Raw, 
        // and we really want to fix the CASING issues, let's stick to Prisma Raw but typescript-safe?
        // Actually, let's iterate. It's safer.

        // Map Aggregates to Dictionary
        const tomadosMap: Record<number, number> = {};
        tomadosAgg.forEach(t => {
            if (t.assignedTo) tomadosMap[t.assignedTo] = Number(t._sum.totalValue) || 0;
        });

        // For Cedidos, we can't easily filter "assignedTo != createdBy" in groupBy. 
        // We'll use a raw query for Balances to be 100% accurate and efficient, BUT with proper casing.

        const rawBalances = await prisma.$queryRaw`
            WITH UserBalances AS (
                SELECT 
                  "assignedTo" as user_id,
                  0 as cedidos,
                  COALESCE(SUM("totalValue"), 0) as tomados
                FROM "Shift"
                WHERE status IN ('Assigned', 'Completed') 
                  AND "isPaid" = false
                  AND "tenantId" = ${tenantId} 
                  AND "deletedAt" IS NULL
                GROUP BY "assignedTo"

                UNION ALL

                SELECT 
                  "createdBy" as user_id,
                  COALESCE(SUM("totalValue"), 0) as cedidos,
                  0 as tomados
                FROM "Shift"
                WHERE "assignedTo" IS NOT NULL 
                  AND "assignedTo" != "createdBy" 
                  AND status IN ('Assigned', 'Completed')
                  AND "isPaid" = false
                  AND "tenantId" = ${tenantId} 
                  AND "deletedAt" IS NULL
                GROUP BY "createdBy"
                
                UNION ALL
                
                SELECT 
                    "userId" as user_id,
                    COALESCE(SUM(amount), 0) as cedidos,
                    0 as tomados
                FROM "Payment"
                WHERE "isClosed" = false
                  AND "tenantId" = ${tenantId}
                GROUP BY "userId"
            )
            SELECT 
                user_id, 
                SUM(cedidos) as cedidos, 
                SUM(tomados) as tomados 
            FROM UserBalances 
            GROUP BY user_id
        `;

        // Merge Raw Data with User Info
        const balanceMap: Record<number, any> = {};
        (rawBalances as any[]).forEach(row => {
            balanceMap[row.user_id] = {
                cedidos: Number(row.cedidos),
                tomados: Number(row.tomados)
            };
        });

        const finalUsers = users.map(u => {
            const b = balanceMap[u.id] || { cedidos: 0, tomados: 0 };
            return {
                ...u,
                cedidos: b.cedidos,
                tomados: b.tomados,
                balance: b.tomados - b.cedidos
            };
        });

        // Globals - Safe simple queries
        const totalTomados = await prisma.shift.aggregate({
            _sum: { totalValue: true },
            where: { tenantId, status: 'Assigned', deletedAt: null }
        });

        const totalPublic = await prisma.shift.aggregate({
            _sum: { totalValue: true },
            where: { tenantId, status: 'Public', deletedAt: null }
        });


        const totalDiscounts = 0; // Simplified for now

        res.json({
            users: finalUsers,
            globals: {
                totalCedidos: 0, // Placeholder
                totalTomados: Number(totalTomados._sum.totalValue) || 0,
                totalDiscounts: 0,
                totalPublicPending: Number(totalPublic._sum.totalValue) || 0
            }
        });

    } catch (error) {
        console.error('Balances Error:', error);
        res.status(500).json({ message: 'Error al obtener balances', details: String(error) });
    }
};

export const getUnpaidShifts = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const tenantId = (req as any).user.tenantId;

    try {
        const uid = Number(userId);

        // Fetch debts (Tomados) and Credits (Cedidos)
        const shifts = await prisma.shift.findMany({
            where: {
                tenantId,
                isPaid: false,
                deletedAt: null,
                status: { in: ['Assigned', 'Completed'] },
                OR: [
                    { assignedTo: uid },
                    {
                        createdBy: uid,
                        assignedTo: { not: null }
                        // Logic: AND assignedTo != createdBy is handled in mapping or implicit if 'assigned'
                    }
                ]
            },
            include: {
                creator: { select: { firstName: true, lastName: true } }
            },
            orderBy: { date: 'desc' }
        });

        // Filter and Map
        const result = shifts.filter(s => {
            // Exclude self-assigned logic if needed
            return s.assignedTo !== s.createdBy;
        }).map(s => ({
            ...s,
            creatorFirstName: s.creator.firstName,
            creatorLastName: s.creator.lastName,
            transactionType: s.assignedTo === uid ? 'TOMADO' : 'CEDIDO'
        }));

        res.json(result);
    } catch (error) {
        console.error('Unpaid Shifts Error:', error);
        res.status(500).json({ message: 'Error al obtener turnos pendientes' });
    }
};

export const registerPayment = async (req: Request, res: Response) => {
    const { userId, amount, notes } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        const payment = await prisma.payment.create({
            data: {
                userId: Number(userId),
                amount: Number(amount),
                notes: notes || '',
                isClosed: false,
                tenantId
            }
        });

        res.json({ message: 'Pago registrado', payment });
    } catch (error) {
        res.status(500).json({ message: 'Error al registrar pago' });
    }
};

export const payBalance = async (req: Request, res: Response) => {
    const { userId } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        const uid = Number(userId);

        // Transaction for safety
        await prisma.$transaction(async (tx) => {
            // 1. Close Shifts
            await tx.shift.updateMany({
                where: {
                    tenantId,
                    isPaid: false,
                    OR: [
                        { assignedTo: uid, status: 'Assigned' },
                        { createdBy: uid, assignedTo: { not: null } } // Simplify filter
                    ]
                },
                data: { isPaid: true, updatedAt: new Date() }
            });

            // 2. Close Payments
            await tx.payment.updateMany({
                where: {
                    userId: uid,
                    isClosed: false,
                    tenantId
                },
                data: { isClosed: true }
            });
        });

        res.json({ message: 'Cuenta saldada correctamente' });
    } catch (error) {
        console.error('Pay Balance Error:', error);
        res.status(500).json({ message: 'Error al procesar pago' });
    }
};
