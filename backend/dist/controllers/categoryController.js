"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategory = exports.deleteCategory = exports.createCategory = exports.addCategoryPriceHistory = exports.getCategoryHistory = exports.getAllCategories = void 0;
const db_1 = __importDefault(require("../db"));
const getAllCategories = async (req, res) => {
    try {
        const { date } = req.query;
        let queryDate = 'NOW()';
        if (date && typeof date === 'string') {
            queryDate = `'${date}'::DATE`;
        }
        const tenantId = req.user.tenantId;
        const query = `
            SELECT 
                c.*,
                COALESCE(
                    (SELECT "baseValue" FROM "ShiftCategoryPriceHistory" 
                     WHERE "categoryId" = c.id AND "effectiveDate" <= ${queryDate} 
                     ORDER BY "effectiveDate" DESC LIMIT 1),
                    c."baseValue"
                ) as "effectiveBaseValue",
                COALESCE(
                    (SELECT "extraHourValue" FROM "ShiftCategoryPriceHistory" 
                     WHERE "categoryId" = c.id AND "effectiveDate" <= ${queryDate} 
                     ORDER BY "effectiveDate" DESC LIMIT 1),
                    c."extraHourValue"
                ) as "effectiveExtraHourValue"
            FROM "ShiftCategory" c
            WHERE c."tenantId" = $1
            ORDER BY c.name ASC
        `;
        const result = await db_1.default.query(query, [tenantId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Category Get Error:', error);
        res.status(500).json({ message: 'Error al obtener categorías' });
    }
};
exports.getAllCategories = getAllCategories;
const getCategoryHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db_1.default.query('SELECT * FROM "ShiftCategoryPriceHistory" WHERE "categoryId" = $1 ORDER BY "effectiveDate" DESC', [id]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Error al obtener historial' });
    }
};
exports.getCategoryHistory = getCategoryHistory;
const addCategoryPriceHistory = async (req, res) => {
    const { id } = req.params;
    const { baseValue, extraHourValue, effectiveDate } = req.body;
    if (!effectiveDate)
        return res.status(400).json({ message: 'Fecha efectiva requerida' });
    try {
        await db_1.default.query('INSERT INTO "ShiftCategoryPriceHistory" ("categoryId", "baseValue", "extraHourValue", "effectiveDate") VALUES ($1, $2, $3, $4)', [id, baseValue, extraHourValue || 0, effectiveDate]);
        res.json({ message: 'Precio programado agregado correctamente' });
    }
    catch (error) {
        console.error('Error adding price history:', error);
        res.status(500).json({ message: 'Error al agregar precio histórico' });
    }
};
exports.addCategoryPriceHistory = addCategoryPriceHistory;
const createCategory = async (req, res) => {
    const { name, baseValue, extraHourValue } = req.body;
    const tenantId = req.user.tenantId;
    try {
        const result = await db_1.default.query('INSERT INTO "ShiftCategory" (name, "baseValue", "extraHourValue", "updatedAt", "tenantId") VALUES ($1, $2, $3, NOW(), $4) RETURNING *', [name, baseValue, extraHourValue || 0, tenantId]);
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Create Category Error:', error);
        res.status(500).json({ message: 'Error al crear la categoría' });
    }
};
exports.createCategory = createCategory;
const deleteCategory = async (req, res) => {
    const { id } = req.params;
    const tenantId = req.user.tenantId;
    try {
        // [New] Strict Ownership Check
        const ownerCheck = await db_1.default.query('SELECT 1 FROM "ShiftCategory" WHERE id = $1 AND "tenantId" = $2', [id, tenantId]);
        if (ownerCheck.rowCount === 0) {
            return res.status(404).json({ message: 'Category not found' });
        }
        // Check for existing shifts
        const checkShifts = await db_1.default.query('SELECT COUNT(*) FROM "Shift" WHERE "categoryId" = $1', [id]);
        if (parseInt(checkShifts.rows[0].count) > 0) {
            return res.status(400).json({ message: 'No se puede eliminar: Hay turnos asociados a esta categoría.' });
        }
        // Also delete history first (FK constraint)
        await db_1.default.query('DELETE FROM "ShiftCategoryPriceHistory" WHERE "categoryId" = $1', [id]);
        await db_1.default.query('DELETE FROM "ShiftCategory" WHERE id = $1 AND "tenantId" = $2', [id, tenantId]);
        res.json({ message: 'Category deleted successfully' });
    }
    catch (error) {
        console.error('Delete Category Error:', error);
        res.status(500).json({ message: 'Error al eliminar la categoría' });
    }
};
exports.deleteCategory = deleteCategory;
const updateCategory = async (req, res) => {
    const { id } = req.params;
    const { name, baseValue, extraHourValue } = req.body;
    try {
        await db_1.default.query('BEGIN');
        // Build dynamic query
        const fields = [];
        const values = [];
        let paramsCount = 1;
        if (name !== undefined) {
            fields.push(`name = $${paramsCount++}`);
            values.push(name);
        }
        if (baseValue !== undefined) {
            fields.push(`"baseValue" = $${paramsCount++}`);
            values.push(baseValue);
        }
        if (extraHourValue !== undefined) {
            fields.push(`"extraHourValue" = $${paramsCount++}`);
            values.push(extraHourValue);
        }
        if (fields.length === 0) {
            await db_1.default.query('ROLLBACK');
            return res.json({ message: 'Nothing to update' });
        }
        const tenantId = req.user.tenantId;
        fields.push(`"updatedAt" = NOW()`);
        // Add ID as last param
        values.push(id);
        values.push(tenantId);
        const query = `UPDATE "ShiftCategory" SET ${fields.join(', ')} WHERE id = $${paramsCount} AND "tenantId" = $${paramsCount + 1}`;
        await db_1.default.query(query, values);
        await db_1.default.query('COMMIT');
        res.json({ message: 'Category updated successfully' });
    }
    catch (error) {
        await db_1.default.query('ROLLBACK');
        console.error('Category Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar categoría' });
    }
};
exports.updateCategory = updateCategory;
