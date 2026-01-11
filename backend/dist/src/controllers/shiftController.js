"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBalances = exports.updateShift = exports.deleteShift = exports.updateShiftStatus = exports.createShift = exports.getAllShifts = void 0;
const db_1 = __importDefault(require("../db"));
const notificationController_1 = require("./notificationController");
const getAllShifts = async (req, res) => {
    try {
        const page = parseInt(req.query.page);
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        let queryText = `
      SELECT s.*, 
             c.name as "categoryName",
             u1."fullName" as "creatorName",
             u1."internalNumber" as "creatorInternalNumber",
             u1."lastName" as "creatorLastName",
             u1."firstName" as "creatorFirstName",
             u2."fullName" as "assigneeName",
             u2."internalNumber" as "assigneeInternalNumber",
             u2."lastName" as "assigneeLastName",
             u2."firstName" as "assigneeFirstName"
      FROM "Shift" s
      LEFT JOIN "ShiftCategory" c ON s."categoryId" = c.id
      LEFT JOIN "User" u1 ON s."createdBy" = u1.id
      LEFT JOIN "User" u2 ON s."assignedTo" = u2.id
    `;
        let shouldPaginate = !isNaN(page) && page > 0;
        const queryParams = [];
        queryText += ` ORDER BY s."createdAt" DESC`;
        if (shouldPaginate) {
            queryText += ` LIMIT $1 OFFSET $2`;
            queryParams.push(limit, offset);
        }
        const result = await db_1.default.query(queryText, queryParams);
        const rowCount = result.rowCount;
        // Quick Total Count (only if paginating, to let frontend know total pages)
        let totalCount = 0;
        if (shouldPaginate) {
            const countRes = await db_1.default.query('SELECT COUNT(*) FROM "Shift"');
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
        console.log('Received Shift Data:', req.body);
        const catId = Number(categoryId);
        if (isNaN(catId)) {
            return res.status(400).json({ message: 'Categoría inválida' });
        }
        // Get requesting user info
        const user = req.user;
        let createdBy = user?.id || 1;
        // ADMIN OVERRIDE: If Admin assigns a "ceding user" (via internal number)
        if ((user?.role === 'Admin' || user?.role === 'SuperAdmin') && cedingInternalNumber) {
            const cedingUserQuery = 'SELECT id FROM "User" WHERE "internalNumber" = $1';
            const cedingUserResult = await db_1.default.query(cedingUserQuery, [cedingInternalNumber]);
            if ((cedingUserResult.rowCount ?? 0) > 0) {
                createdBy = cedingUserResult.rows[0].id;
                console.log(`Admin ${user.internalNumber} creating shift on behalf of user ${cedingInternalNumber} (ID: ${createdBy})`);
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
        const query = `
      INSERT INTO "Shift" 
      ("categoryId", "serviceNumber", "date", "time", "endTime", "line", "relief", "carNumber", "extraHours", "tip", "tipValue", "totalValue", "transformaFacil", "createdBy", "status", "updatedAt")
      VALUES ($1, $2, $3::DATE, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'Created', NOW())
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
            Number(createdBy)
        ];
        console.log('Executing Insert with values:', values);
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
        const checkQuery = 'SELECT "assignedTo", "status" FROM "Shift" WHERE "id" = $1';
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
        let query = 'UPDATE "Shift" SET "status" = $1, "updatedAt" = NOW()';
        const values = [status];
        let paramCount = 2;
        if (assignedTo !== undefined) {
            query += `, "assignedTo" = $${paramCount++}`;
            values.push(assignedTo);
        }
        if (transformaFacilDiscount !== undefined) {
            query += `, "transformaFacilDiscount" = $${paramCount++}`;
            values.push(transformaFacilDiscount);
        }
        query += ` WHERE "id" = $${paramCount} RETURNING *`;
        values.push(Number(id));
        const result = await db_1.default.query(query, values);
        const updatedShift = result.rows[0];
        // Automatic Notifications
        if (status === 'Public' && currentShift.status !== 'Public') {
            await (0, notificationController_1.createNotification)(updatedShift.createdBy, 'Turno Aprobado', `Tu turno #${updatedShift.serviceNumber} ha sido aprobado y publicado.`, 'SUCCESS');
        }
        // Notify if assigned or reassigned
        if (status === 'Assigned' && assignedTo) {
            const isReassignment = currentShift.assignedTo && currentShift.assignedTo !== assignedTo;
            if (isReassignment) {
                // Notify previous owner if needed? Maybe later.
                await (0, notificationController_1.createNotification)(assignedTo, 'Turno Reasignado', `Se te ha reasignado el turno servicio #${updatedShift.serviceNumber}.`, 'INFO');
            }
            else if (!currentShift.assignedTo) {
                await (0, notificationController_1.createNotification)(assignedTo, 'Nuevo Turno Asignado', `Se te ha asignado el turno servicio #${updatedShift.serviceNumber}.`, 'INFO');
                await (0, notificationController_1.createNotification)(updatedShift.createdBy, 'Turno Tomado', `Tu turno #${updatedShift.serviceNumber} ha sido tomado por otro usuario.`, 'INFO');
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
        const query = 'DELETE FROM "Shift" WHERE "id" = $1 RETURNING *';
        const result = await db_1.default.query(query, [Number(id)]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Turno no encontrado' });
        }
        res.json({ message: 'Turno eliminado correctamente', shift: result.rows[0] });
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
      UPDATE "Shift" 
      SET "categoryId" = $1, "serviceNumber" = $2, "date" = $3, "time" = $4, "endTime" = $5,
          "line" = $6, "relief" = $7, "carNumber" = $8, "extraHours" = $9, 
          "tip" = $10, "tipValue" = $11, "totalValue" = $12, "transformaFacil" = $13,
          "status" = $14, "updatedAt" = NOW()
      WHERE "id" = $15
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
            !!tip,
            Number(tipValue) || 0,
            Number(totalValue) || 0,
            !!transformaFacil,
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
        const query = `
      WITH UserBalances AS (
        -- 1. Shifts TAKEN (Realizados) - Income for Assignee
        SELECT 
          s."assignedTo" as user_id,
          u."internalNumber",
          u."firstName",
          u."lastName",
          0 as cedidos,
          COALESCE(SUM(s."totalValue"), 0) as tomados
        FROM "Shift" s
        JOIN "User" u ON s."assignedTo" = u.id
        WHERE s."status" = 'Assigned'
        GROUP BY s."assignedTo", u."internalNumber", u."firstName", u."lastName"

        UNION ALL

        -- 2. Shifts GIVEN (Cedidos) - Outcome for Creator
        SELECT 
          s."createdBy" as user_id,
          u."internalNumber",
          u."firstName",
          u."lastName",
          COALESCE(SUM(s."totalValue"), 0) as cedidos,
          0 as tomados
        FROM "Shift" s
        JOIN "User" u ON s."createdBy" = u.id
        WHERE s."assignedTo" IS NOT NULL AND s."assignedTo" != s."createdBy"
        GROUP BY s."createdBy", u."internalNumber", u."firstName", u."lastName"
      )
      SELECT 
        user_id,
        "internalNumber" as "internalNumber",
        "firstName",
        "lastName",
        SUM(cedidos) as cedidos,
        SUM(tomados) as tomados,
        (SUM(tomados) - SUM(cedidos)) as balance
      FROM UserBalances
      GROUP BY user_id, "internalNumber", "firstName", "lastName"
      ORDER BY "internalNumber" ASC
    `;
        const result = await db_1.default.query(query);
        // Calculate Global Totals
        const globalsQuery = `
      SELECT 
        (SELECT COALESCE(SUM("totalValue"), 0) FROM "Shift" WHERE "status" = 'Assigned') as total_tomados,
        
        (SELECT COALESCE(SUM("totalValue"), 0) FROM "Shift" WHERE "status" = 'Public') as total_publicos_value,

        (SELECT COALESCE(SUM("totalValue"), 0) FROM "Shift" WHERE "assignedTo" IS NOT NULL AND "assignedTo" != "createdBy") as total_cedidos_value,

        -- A Cubrir (Admin): Total Payout Liability.
        -- Logic: The amount Admin must pay to Assignees.
        -- Formula: Total Value - Discount (Commission).
        -- If discount is 0/null, Admin pays full value.
        (SELECT COALESCE(SUM("totalValue" - COALESCE("transformaFacilDiscount", 0)), 0) 
         FROM "Shift" 
         WHERE "transformaFacil" = true 
         AND ("status" = 'Assigned' OR "status" = 'Public' OR "status" = 'Created')) as total_transforma_facil
    `;
        const globalsResult = await db_1.default.query(globalsQuery);
        const globals = globalsResult.rows[0];
        res.json({
            users: result.rows,
            globals: {
                totalCedidos: Number(globals.total_cedidos_value), // Matches 'cedidos' logic roughly
                totalTomados: Number(globals.total_tomados), // Matches 'tomados' logic
                totalDiscounts: Number(globals.total_transforma_facil),
                totalPublicPending: Number(globals.total_publicos_value) // Extra info
            }
        });
    }
    catch (error) {
        console.error('Balances Error:', error);
        res.status(500).json({ message: 'Error al obtener balances' });
    }
};
exports.getBalances = getBalances;
//# sourceMappingURL=shiftController.js.map