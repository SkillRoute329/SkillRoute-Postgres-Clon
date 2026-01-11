"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.payBalance = exports.registerPayment = exports.getUnpaidShifts = exports.getBalances = exports.updateShift = exports.deleteShift = exports.updateShiftStatus = exports.createShift = exports.getAllShifts = void 0;
const db_1 = __importDefault(require("../db"));
const notificationController_1 = require("./notificationController");
const getAllShifts = async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const tenantId = req.user.tenantId;
        let queryText = `
      SELECT s.*, 
             c.name as "categoryName",
             u1.fullname as "creatorName",
             u1.internalnumber as "creatorInternalNumber",
             u1.lastname as "creatorLastName",
             u1.firstname as "creatorFirstName",
             u2.fullname as "assigneeName",
             u2.internalnumber as "assigneeInternalNumber",
             u2.lastname as "assigneeLastName",
             u2.firstname as "assigneeFirstName",
             u2.phonenumber as "assigneePhone"
      FROM shift s
      LEFT JOIN shiftcategory c ON s.categoryid = c.id
      LEFT JOIN "user" u1 ON s.createdby = u1.id
      LEFT JOIN "user" u2 ON s.assignedto = u2.id
      WHERE s.tenantid = $1 AND s.deletedat IS NULL
    `;
        let shouldPaginate = !isNaN(page) && page > 0;
        const queryParams = [tenantId]; // $1 is tenantId
        queryText += ` ORDER BY s.createdat DESC`;
        if (shouldPaginate) {
            queryText += ` LIMIT $2 OFFSET $3`; // Using $2 and $3 because $1 is tenantId
            queryParams.push(limit, offset);
        }
        const result = await db_1.default.query(queryText, queryParams);
        const rowCount = result.rowCount;
        // Quick Total Count (only if paginating, to let frontend know total pages)
        let totalCount = 0;
        if (shouldPaginate) {
            const countRes = await db_1.default.query('SELECT COUNT(*) FROM shift WHERE tenantid = $1 AND deletedat IS NULL', [tenantId]);
            totalCount = parseInt(countRes.rows[0].count);
        }
        // Format to match frontend expectations
        const shifts = result.rows.map(s => ({
            ...s,
            category: s.categoryName,
        }));
        if (shouldPaginate) {
            res.json({
                data: shifts,
                meta: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount
                }
            });
        }
        else {
            // Legacy/No-Pagination Mode (Direct Array)
            res.json(shifts);
        }
    }
    catch (error) {
        console.error('Shift Get Error:', error);
        res.status(500).json({ message: 'Error al obtener turnos' });
    }
};
exports.getAllShifts = getAllShifts;
const createShift = async (req, res) => {
    const { categoryId, serviceNumber, date, time, line, relief, carNumber, extraHours, tip, tipValue, totalValue, transformaFacil, cedingInternalNumber // New field
     } = req.body;
    try {
        const catId = Number(categoryId);
        if (isNaN(catId)) {
            return res.status(400).json({ message: 'Categoría inválida' });
        }
        // Get requesting user info
        const user = req.user;
        let createdBy = user?.id || 1;
        // ADMIN OVERRIDE: If Admin assigns a "ceding user" (via internal number)
        if ((user?.role === 'Admin' || user?.role === 'SuperAdmin') && cedingInternalNumber) {
            const cedingUserQuery = 'SELECT id FROM "user" WHERE internalnumber = $1';
            const cedingUserResult = await db_1.default.query(cedingUserQuery, [cedingInternalNumber]);
            if ((cedingUserResult.rowCount ?? 0) > 0) {
                createdBy = cedingUserResult.rows[0].id;
            }
            else {
                return res.status(404).json({ message: `No se encontró el usuario con interno ${cedingInternalNumber}` });
            }
        }
        // Format date properly for PostgreSQL DATE type
        if (!date) {
            return res.status(400).json({ message: 'La fecha es requerida' });
        }
        if (!req.body.endTime) {
            return res.status(400).json({ message: 'La hora de fin es requerida' });
        }
        let shiftDate = date;
        // If it looks like a full ISO string (has T), extract YYYY-MM-DD
        if (date.includes('T')) {
            shiftDate = new Date(date).toISOString().split('T')[0];
        }
        // Validate time
        const shiftTime = time || '00:00';
        // Determine initial status
        // Admin/SuperAdmin shifts are auto-approved (Public)
        const initialStatus = (user?.role === 'Admin' || user?.role === 'SuperAdmin') ? 'Public' : 'Created';
        // Strict Tenant Check
        const tenantId = user?.tenantId;
        if (!tenantId) {
            return res.status(401).json({ message: 'Error de sesión: Tenant ID no encontrado. Por favor reloguee.' });
        }
        const query = `
      INSERT INTO shift 
      (categoryid, servicenumber, date, time, endtime, line, relief, carnumber, extrahours, tip, tipvalue, totalvalue, transformafacil, createdby, status, updatedat, tenantid)
      VALUES ($1, $2, $3::DATE, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16)
      RETURNING *
    `;
        const values = [
            catId,
            serviceNumber || '',
            shiftDate,
            shiftTime,
            req.body.endTime || '',
            line || '',
            relief || '',
            carNumber || '',
            Number(extraHours) || 0,
            Boolean(tip),
            Number(tipValue) || 0,
            Number(totalValue) || 0,
            Boolean(transformaFacil),
            Number(createdBy),
            initialStatus,
            tenantId
        ];
        const result = await db_1.default.query(query, values);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Shift Create Error Details:', error);
        res.status(500).json({ message: 'Error al crear turno', details: error instanceof Error ? error.message : 'Unknown' });
    }
};
exports.createShift = createShift;
const updateShiftStatus = async (req, res) => {
    const { id } = req.params;
    const { status, assignedTo, transformaFacilDiscount } = req.body;
    try {
        // Validation: Check current state before update to prevent race conditions
        const checkQuery = 'SELECT assignedto as "assignedTo", status FROM shift WHERE id = $1';
        const checkResult = await db_1.default.query(checkQuery, [Number(id)]);
        if (checkResult.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }
        const currentShift = checkResult.rows[0];
        const userRole = req.user?.role; // Assuming authMiddleware attaches user with role
        // If trying to assign (assignedTo provided)
        if (assignedTo !== undefined) {
            // If already assigned AND not Admin, block it
            if (currentShift.assignedTo && currentShift.assignedTo !== assignedTo && userRole !== 'Admin') {
                return res.status(409).json({ message: 'Este turno ya ha sido tomado por otro usuario.' });
            }
        }
        let query = 'UPDATE shift SET status = $1, updatedat = NOW()';
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
        const result = await db_1.default.query(query, values);
        const updatedShift = result.rows[0];
        // Automatic Notifications
        if (status === 'Public' && currentShift.status !== 'Public') {
            await (0, notificationController_1.createNotification)(updatedShift.createdby, `Turno Aprobado: Tu turno #${updatedShift.servicenumber} ha sido aprobado y publicado.`);
        }
        // Notify if assigned or reassigned
        if (status === 'Assigned' && assignedTo) {
            const isReassignment = currentShift.assignedTo && currentShift.assignedTo !== assignedTo;
            if (isReassignment) {
                // Notify previous owner if needed? Maybe later.
                await (0, notificationController_1.createNotification)(assignedTo, `Turno Reasignado: Se te ha reasignado el turno servicio #${updatedShift.servicenumber}.`);
            }
            else if (!currentShift.assignedTo) {
                await (0, notificationController_1.createNotification)(assignedTo, `Nuevo Turno Asignado: Se te ha asignado el turno servicio #${updatedShift.servicenumber}.`);
                await (0, notificationController_1.createNotification)(updatedShift.createdby, `Turno Tomado: Tu turno #${updatedShift.servicenumber} ha sido tomado por otro usuario.`);
            }
            // --- WhatsApp Integration ---
            try {
                // Fetch assignee phone
                const userRes = await db_1.default.query('SELECT phonenumber as "phoneNumber", firstname as "firstName", fullname as "fullName" FROM "user" WHERE id = $1', [assignedTo]);
                const assignee = userRes.rows[0];
                if (assignee && assignee.phoneNumber) {
                    const { whatsAppService } = await Promise.resolve().then(() => __importStar(require('../services/whatsappService')));
                    // Debug status
                    const waStatus = whatsAppService.getStatus();
                    // Fetch category Name for better message
                    const catRes = await db_1.default.query('SELECT name FROM shiftcategory WHERE id = $1', [updatedShift.categoryid]);
                    const categoryName = catRes.rows[0]?.name || '';
                    const message = `👋 Hola ${assignee.firstName || assignee.fullName || 'Chofer'}, se te ha asignado un nuevo turno (Automático):\n` +
                        `📅 Fecha: ${new Date(updatedShift.date).toLocaleDateString()}\n` +
                        `⏰ Hora: ${updatedShift.time} Hs${updatedShift.endtime ? ` - ${updatedShift.endtime} Hs` : ''}\n` +
                        `🚌 Coche: ${updatedShift.carnumber} (Línea ${updatedShift.line})\n` +
                        `💵 Valor: $${Number(updatedShift.totalvalue).toLocaleString()}\n` +
                        `Categoría: ${categoryName}\n\n` +
                        `Ingresa a la app para gestionarlo.`;
                    const sent = await whatsAppService.sendMessage(assignee.phoneNumber, message);
                }
                else {
                }
            }
            catch (waError) {
                console.error('Error auto-sending WhatsApp:', waError);
            }
        }
        res.json(updatedShift);
    }
    catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar estado' });
    }
};
exports.updateShiftStatus = updateShiftStatus;
const deleteShift = async (req, res) => {
    const { id } = req.params;
    try {
        const tenantId = req.user.tenantId; // Ensure tenant isolation
        const query = 'UPDATE shift SET deletedat = NOW() WHERE id = $1 AND tenantid = $2 RETURNING *';
        const result = await db_1.default.query(query, [Number(id), tenantId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado o no autorizado' });
        }
        res.json({ message: 'Turno eliminado correctamente (Soft Delete)', shift: result.rows[0] });
    }
    catch (error) {
        console.error('Shift Delete Error:', error);
        res.status(500).json({ message: 'Error al eliminar turno' });
    }
};
exports.deleteShift = deleteShift;
const updateShift = async (req, res) => {
    const { id } = req.params;
    const { categoryId, serviceNumber, date, time, line, relief, carNumber, extraHours, tip, tipValue, totalValue, transformaFacil, status } = req.body;
    try {
        const shiftDate = new Date(date).toISOString().split('T')[0];
        const shiftEndTime = req.body.endTime || '';
        const query = `
      UPDATE shift 
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
        const result = await db_1.default.query(query, values);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Shift Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar turno', details: error instanceof Error ? error.message : 'Unknown' });
    }
};
exports.updateShift = updateShift;
const getBalances = async (req, res) => {
    try {
        const tenantId = req.user.tenantId;
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
        FROM shift s
        WHERE s.status IN ('Assigned', 'Completed') AND s.ispaid = false
          AND s.tenantid = $1 AND s.deletedat IS NULL
        GROUP BY s.assignedto

        UNION ALL

        -- 2. Shifts GIVEN (Cedidos)
        SELECT 
          s.createdby as user_id,
          COALESCE(SUM(s.totalvalue), 0) as cedidos,
          0 as tomados
        FROM shift s
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
        FROM payment p
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
      FROM "user" u
      LEFT JOIN AggregatedBalances ab ON u.id = ab.user_id
      WHERE u.role != 'SuperAdmin' 
        AND u.tenantid = $1
      ORDER BY u.internalnumber ASC
    `;
        const result = await db_1.default.query(query, [tenantId]);
        // Calculate Global Totals
        const globalsQuery = `
      SELECT 
        (SELECT COALESCE(SUM(totalvalue), 0) FROM shift WHERE status = 'Assigned' AND tenantid = $1) as total_tomados,
        
        (SELECT COALESCE(SUM(totalvalue), 0) FROM shift WHERE status = 'Public' AND tenantid = $1) as total_publicos_value,

        (SELECT COALESCE(SUM(totalvalue), 0) FROM shift WHERE assignedto IS NOT NULL AND assignedto != createdby AND tenantid = $1) as total_cedidos_value,

        -- A Cubrir (Admin): Total Payout Liability.
        (SELECT COALESCE(SUM(totalvalue - COALESCE(transformafacildiscount, 0)), 0) 
         FROM shift 
         WHERE transformafacil = true 
         AND (status = 'Assigned' OR status = 'Public' OR status = 'Created')
         AND tenantid = $1
        ) as total_transforma_facil
    `;
        const globalsResult = await db_1.default.query(globalsQuery, [tenantId]);
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
    }
    catch (error) {
        console.error('Balances Error:', error);
        res.status(500).json({ message: 'Error al obtener balances' });
    }
};
exports.getBalances = getBalances;
// --- PAYOUTS SYSTEM ---
const getUnpaidShifts = async (req, res) => {
    const { userId } = req.params;
    const tenantId = req.user.tenantId;
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

      FROM shift s
      JOIN "user" u ON s.createdby = u.id
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
        const result = await db_1.default.query(query, [userId, tenantId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching unpaid shifts:', error);
        res.status(500).json({ message: 'Error al obtener turnos pendientes' });
    }
};
exports.getUnpaidShifts = getUnpaidShifts;
const registerPayment = async (req, res) => {
    const { userId, amount, notes } = req.body;
    const tenantId = req.user.tenantId;
    try {
        if (!userId || !amount) {
            return res.status(400).json({ message: 'User ID and amount are required' });
        }
        const query = `
      INSERT INTO payment (userid, amount, notes, isclosed, tenantid)
      VALUES ($1, $2, $3, false, $4)
      RETURNING *
    `;
        const result = await db_1.default.query(query, [userId, amount, notes || '', tenantId]);
        res.json({
            message: 'Pago parcial registrado correctamente.',
            payment: result.rows[0]
        });
    }
    catch (error) {
        console.error('Error registering payment:', error.message);
        res.status(500).json({ message: 'Error al registrar pago parcial' });
    }
};
exports.registerPayment = registerPayment;
const payBalance = async (req, res) => {
    const { userId } = req.body;
    const tenantId = req.user.tenantId;
    try {
        if (!userId)
            return res.status(400).json({ message: 'User ID required' });
        const client = await db_1.default.connect();
        try {
            await client.query('BEGIN');
            // 1. Close all Shifts (Debts/Credits)
            const shiftsQuery = `
              UPDATE shift 
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
              UPDATE payment
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
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        console.error('Error paying balance:', error);
        res.status(500).json({ message: 'Error al procesar pago completo' });
    }
};
exports.payBalance = payBalance;
