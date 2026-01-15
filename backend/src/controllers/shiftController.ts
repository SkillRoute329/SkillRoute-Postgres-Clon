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

export const updateShiftStatus = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { status, assignedTo, transformaFacilDiscount } = req.body;

    try {
        // Validation: Check current state before update to prevent race conditions
        const checkQuery = 'SELECT assignedto as "assignedTo", status FROM "Shift" WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [Number(id)]);

        if (checkResult.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }

        const currentShift = checkResult.rows[0];
        const userRole = (req as any).user?.role; // Assuming authMiddleware attaches user with role

        // If trying to assign (assignedTo provided)
        if (assignedTo !== undefined) {
            // If already assigned AND not Admin, block it
            if (currentShift.assignedTo && currentShift.assignedTo !== assignedTo && userRole !== 'Admin') {
                return res.status(409).json({ message: 'Este turno ya ha sido tomado por otro usuario.' });
            }
        }

        let query = 'UPDATE "Shift" SET status = $1, updatedat = NOW()';
        const values = [status];
        let paramCount = 2;

        if (assignedTo !== undefined) {
            query += `, assignedto = $${paramCount++}`;
            values.push(assignedTo);
        }
        if (transformaFacilDiscount !== undefined) {
            query += `, transformafacildiscount = $${paramCount++}`;
            values.push(transformaFacilDiscount);
        }

        query += ` WHERE id = $${paramCount} RETURNING *`;
        values.push(Number(id));

        const result = await pool.query(query, values);
        const updatedShift = result.rows[0];

        // Automatic Notifications
        if (status === 'Public' && currentShift.status !== 'Public') {
            await createNotification(updatedShift.createdby, `Turno Aprobado: Tu turno #${updatedShift.servicenumber} ha sido aprobado y publicado.`);
        }

        // Notify if assigned or reassigned
        if (status === 'Assigned' && assignedTo) {
            const isReassignment = currentShift.assignedTo && currentShift.assignedTo !== assignedTo;

            if (isReassignment) {
                // Notify previous owner if needed? Maybe later.
                await createNotification(assignedTo, `Turno Reasignado: Se te ha reasignado el turno servicio #${updatedShift.servicenumber}.`);
            } else if (!currentShift.assignedTo) {
                await createNotification(assignedTo, `Nuevo Turno Asignado: Se te ha asignado el turno servicio #${updatedShift.servicenumber}.`);
                await createNotification(updatedShift.createdby, `Turno Tomado: Tu turno #${updatedShift.servicenumber} ha sido tomado por otro usuario.`);
            }

            // --- WhatsApp Integration ---

            try {
                // Fetch assignee phone
                const userRes = await pool.query('SELECT phonenumber as "phoneNumber", firstname as "firstName", fullname as "fullName" FROM "User" WHERE id = $1', [assignedTo]);
                const assignee = userRes.rows[0];


                if (assignee && assignee.phoneNumber) {
                    const { whatsAppService } = await import('../services/whatsappService');

                    // Debug status
                    const waStatus = whatsAppService.getStatus();


                    // Fetch category Name for better message
                    const catRes = await pool.query('SELECT name FROM "ShiftCategory" WHERE id = $1', [updatedShift.categoryid]);
                    const categoryName = catRes.rows[0]?.name || '';

                    const message = `👋 Hola ${assignee.firstName || assignee.fullName || 'Chofer'}, se te ha asignado un nuevo turno (Automático):\n` +
                        `📅 Fecha: ${new Date(updatedShift.date).toLocaleDateString()}\n` +
                        `⏰ Hora: ${updatedShift.time} Hs${updatedShift.endtime ? ` - ${updatedShift.endtime} Hs` : ''}\n` +
                        `🚌 Coche: ${updatedShift.carnumber} (Línea ${updatedShift.line})\n` +
                        `💵 Valor: $${Number(updatedShift.totalvalue).toLocaleString()}\n` +
                        `Categoría: ${categoryName}\n\n` +
                        `Ingresa a la app para gestionarlo.`;


                    const sent = await whatsAppService.sendMessage(assignee.phoneNumber, message);

                } else {

                }
            } catch (waError) {
                console.error('Error auto-sending WhatsApp:', waError);
            }
        }

        res.json(updatedShift);
    } catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar estado' });
    }

};

export const deleteShift = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const tenantId = (req as any).user.tenantId; // Ensure tenant isolation
        const query = 'UPDATE "Shift" SET deletedat = NOW() WHERE id = $1 AND tenantid = $2 RETURNING *';
        const result = await pool.query(query, [Number(id), tenantId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado o no autorizado' });
        }

        res.json({ message: 'Turno eliminado correctamente (Soft Delete)', shift: result.rows[0] });
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
        transformaFacil, status
    } = req.body;

    try {
        const shiftDate = new Date(date).toISOString().split('T')[0];

        const shiftEndTime = req.body.endTime || '';

        const query = `
      UPDATE "Shift" 
      SET categoryid = $1, servicenumber = $2, date = $3, time = $4, endtime = $5,
          line = $6, relief = $7, carnumber = $8, extrahours = $9, 
          tip = $10, tipvalue = $11, totalvalue = $12, transformafacil = $13,
          status = $14, updatedat = NOW()
      WHERE id = $15
      RETURNING *
    `;
        const values = [
            Number(categoryId),
            serviceNumber || '',
            shiftDate,
            time,
            shiftEndTime,
            line || '',
            relief || '',
            carNumber || '',
            Number(extraHours) || 0,
            Boolean(tip),
            Number(tipValue) || 0,
            Number(totalValue) || 0,
            Boolean(transformaFacil),
            status || 'Created',
            Number(id)
        ];

        const result = await pool.query(query, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar turno', details: error instanceof Error ? error.message : 'Unknown' });
    }
};
export const getBalances = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user.tenantId;
        if (!tenantId) {
            return res.status(401).json({ message: 'Token obsoleto. Por favor reloguee.' });
        }

        const query = `
      WITH UserBalances AS (
        -- 1. Shifts TAKEN (Realizados)
        SELECT 
          s.assignedto as user_id,
          0 as cedidos,
          COALESCE(SUM(s.totalvalue), 0) as tomados
        FROM "Shift" s
        WHERE s.status IN ('Assigned', 'Completed') AND s.ispaid = false
          AND s.tenantid = $1 AND s.deletedat IS NULL
        GROUP BY s.assignedto

        UNION ALL

        -- 2. Shifts GIVEN (Cedidos)
        SELECT 
          s.createdby as user_id,
          COALESCE(SUM(s.totalvalue), 0) as cedidos,
          0 as tomados
        FROM "Shift" s
        WHERE s.assignedto IS NOT NULL 
          AND s.assignedto != s.createdby 
          AND s.status IN ('Assigned', 'Completed')
          AND s.ispaid = false
          AND s.tenantid = $1 AND s.deletedat IS NULL
        GROUP BY s.createdby

        UNION ALL

        -- 3. Partial Payments
        SELECT
            p.userid as user_id,
            COALESCE(SUM(p.amount), 0) as cedidos,
            0 as tomados
        FROM "Payment" p
        WHERE p.isclosed = false
          AND p.tenantid = $1
        GROUP BY p.userid
      ),
      AggregatedBalances AS (
        SELECT 
            user_id,
            SUM(cedidos) as cedidos,
            SUM(tomados) as tomados
        FROM UserBalances
        GROUP BY user_id
      )
      SELECT 
        u.id as user_id,
        u.internalnumber as "internalNumber",
        u.firstname as "firstName",
        u.lastname as "lastName",
        COALESCE(ab.cedidos, 0) as cedidos,
        COALESCE(ab.tomados, 0) as tomados,
        (COALESCE(ab.tomados, 0) - COALESCE(ab.cedidos, 0)) as balance
      FROM "User" u
      LEFT JOIN AggregatedBalances ab ON u.id = ab.user_id
      WHERE u.role != 'SuperAdmin' 
        AND u.tenantid = $1
      ORDER BY u.internalnumber ASC
    `;

        const result = await pool.query(query, [tenantId]);

        // Calculate Global Totals
        const globalsQuery = `
      SELECT 
        (SELECT COALESCE(SUM(totalvalue), 0) FROM "Shift" WHERE status = 'Assigned' AND tenantid = $1) as total_tomados,
        
        (SELECT COALESCE(SUM(totalvalue), 0) FROM "Shift" WHERE status = 'Public' AND tenantid = $1) as total_publicos_value,

        (SELECT COALESCE(SUM(totalvalue), 0) FROM "Shift" WHERE assignedto IS NOT NULL AND assignedto != createdby AND tenantid = $1) as total_cedidos_value,

        -- A Cubrir (Admin): Total Payout Liability.
        (SELECT COALESCE(SUM(totalvalue - COALESCE(transformafacildiscount, 0)), 0) 
         FROM "Shift" 
         WHERE transformafacil = true 
         AND (status = 'Assigned' OR status = 'Public' OR status = 'Created')
         AND tenantid = $1
        ) as total_transforma_facil
    `;
        const globalsResult = await pool.query(globalsQuery, [tenantId]);
        const globals = globalsResult.rows[0];

        res.json({
            users: result.rows,
            globals: {
                totalCedidos: Number(globals.total_cedidos_value),
                totalTomados: Number(globals.total_tomados),
                totalDiscounts: Number(globals.total_transforma_facil),
                totalPublicPending: Number(globals.total_publicos_value)
            }
        });

    } catch (error) {
        console.error('Balances Error:', error);
        res.status(500).json({ message: 'Error al obtener balances' });
    }
};

// --- PAYOUTS SYSTEM ---

export const getUnpaidShifts = async (req: Request, res: Response) => {
    const { userId } = req.params;
    const tenantId = (req as any).user.tenantId;

    try {
        const query = `
      SELECT s.*, 
             u.firstname as "creatorFirstName", 
             u.lastname as "creatorLastName",
             
             -- Add flag to distinguish type in frontend if needed
             CASE 
                WHEN s.assignedto = $1 THEN 'TOMADO'
                WHEN s.createdby = $1 THEN 'CEDIDO'
                ELSE 'UNKNOWN'
             END as "transactionType"

      FROM "Shift" s
      JOIN "User" u ON s.createdby = u.id
      WHERE 
        s.ispaid = false
        AND s.tenantid = $2
        AND s.deletedat IS NULL
        AND (
          (s.assignedto = $1 AND s.status = 'Assigned')
          OR
          (s.createdby = $1 AND s.assignedto IS NOT NULL AND s.assignedto != s.createdby)
        )
      ORDER BY s.date DESC
    `;
        const result = await pool.query(query, [userId, tenantId]);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching unpaid shifts:', error);
        res.status(500).json({ message: 'Error al obtener turnos pendientes' });
    }
};

export const registerPayment = async (req: Request, res: Response) => {
    const { userId, amount, notes } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        if (!userId || !amount) {
            return res.status(400).json({ message: 'User ID and amount are required' });
        }

        const query = `
      INSERT INTO "Payment" (userid, amount, notes, isclosed, tenantid)
      VALUES ($1, $2, $3, false, $4)
      RETURNING *
    `;
        const result = await pool.query(query, [userId, amount, notes || '', tenantId]);

        res.json({
            message: 'Pago parcial registrado correctamente.',
            payment: result.rows[0]
        });
    } catch (error) {
        console.error('Error registering payment:', (error as any).message);
        res.status(500).json({ message: 'Error al registrar pago parcial' });
    }
};

export const payBalance = async (req: Request, res: Response) => {
    const { userId } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        if (!userId) return res.status(400).json({ message: 'User ID required' });

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Close all Shifts (Debts/Credits)
            const shiftsQuery = `
              UPDATE "Shift" 
              SET ispaid = true, updatedat = NOW()
              WHERE 
                ispaid = false 
                AND tenantid = $2
                AND (
                  (assignedto = $1 AND status = 'Assigned') 
                  OR 
                  (createdby = $1 AND assignedto IS NOT NULL AND assignedto != createdby)
                )
            `;
            const shiftsResult = await client.query(shiftsQuery, [userId, tenantId]);

            // 2. Close all Payments (Advances)
            const paymentsQuery = `
              UPDATE "Payment"
              SET isclosed = true
              WHERE userid = $1 AND isclosed = false AND tenantid = $2
            `;
            const paymentsResult = await client.query(paymentsQuery, [userId, tenantId]);

            await client.query('COMMIT');

            res.json({
                message: 'Cuenta saldada completamente (Turnos y Pagos cerrados).',
                shiftsUpdated: shiftsResult.rowCount,
                paymentsClosed: paymentsResult.rowCount
            });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error paying balance:', error);
        res.status(500).json({ message: 'Error al procesar pago completo' });
    }
};
