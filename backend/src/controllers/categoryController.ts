import { Request, Response } from 'express';
import pool from '../db';

export const getAllCategories = async (req: Request, res: Response) => {
    try {
        const { date } = req.query;
        let queryDate = 'NOW()';

        if (date && typeof date === 'string') {
            queryDate = `'${date}'::DATE`;
        }

        const tenantId = (req as any).user.tenantId;


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

        const result = await pool.query(query, [tenantId]);


        res.json(result.rows);
    } catch (error) {
        console.error('Category Get Error:', error);
        res.status(500).json({ message: 'Error al obtener categorías' });
    }
};

export const getCategoryHistory = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM "ShiftCategoryPriceHistory" WHERE "categoryId" = $1 ORDER BY "effectiveDate" DESC',
            [id]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ message: 'Error al obtener historial' });
    }
};

export const addCategoryPriceHistory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { baseValue, extraHourValue, effectiveDate } = req.body;

    if (!effectiveDate) return res.status(400).json({ message: 'Fecha efectiva requerida' });

    try {
        await pool.query(
            'INSERT INTO "ShiftCategoryPriceHistory" ("categoryId", "baseValue", "extraHourValue", "effectiveDate") VALUES ($1, $2, $3, $4)',
            [id, baseValue, extraHourValue || 0, effectiveDate]
        );
        res.json({ message: 'Precio programado agregado correctamente' });
    } catch (error) {
        console.error('Error adding price history:', error);
        res.status(500).json({ message: 'Error al agregar precio histórico' });
    }
};


export const createCategory = async (req: Request, res: Response) => {
    const { name, baseValue, extraHourValue } = req.body;
    const tenantId = (req as any).user.tenantId;

    try {
        const result = await pool.query(
            'INSERT INTO "ShiftCategory" (name, "baseValue", "extraHourValue", "updatedAt", "tenantId") VALUES ($1, $2, $3, NOW(), $4) RETURNING *',
            [name, baseValue, extraHourValue || 0, tenantId]
        );
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Create Category Error:', error);
        res.status(500).json({ message: 'Error al crear la categoría' });
    }
};

export const deleteCategory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const tenantId = (req as any).user.tenantId;

    try {
        // [New] Strict Ownership Check
        const ownerCheck = await pool.query('SELECT 1 FROM "ShiftCategory" WHERE id = $1 AND "tenantId" = $2', [id, tenantId]);
        if (ownerCheck.rowCount === 0) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Check for existing shifts
        const checkShifts = await pool.query('SELECT COUNT(*) FROM "Shift" WHERE "categoryId" = $1', [id]);
        if (parseInt(checkShifts.rows[0].count) > 0) {
            return res.status(400).json({ message: 'No se puede eliminar: Hay turnos asociados a esta categoría.' });
        }

        // Also delete history first (FK constraint)
        await pool.query('DELETE FROM "ShiftCategoryPriceHistory" WHERE "categoryId" = $1', [id]);

        await pool.query('DELETE FROM "ShiftCategory" WHERE id = $1 AND "tenantId" = $2', [id, tenantId]);
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        console.error('Delete Category Error:', error);
        res.status(500).json({ message: 'Error al eliminar la categoría' });
    }
};

export const updateCategory = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, baseValue, extraHourValue } = req.body;

    try {
        await pool.query('BEGIN');

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
            await pool.query('ROLLBACK');
            return res.json({ message: 'Nothing to update' });
        }

        const tenantId = (req as any).user.tenantId;

        fields.push(`"updatedAt" = NOW()`);

        // Add ID as last param
        values.push(id);
        values.push(tenantId);

        const query = `UPDATE "ShiftCategory" SET ${fields.join(', ')} WHERE id = $${paramsCount} AND "tenantId" = $${paramsCount + 1}`;

        await pool.query(query, values);
        await pool.query('COMMIT');

        res.json({ message: 'Category updated successfully' });
    } catch (error) {
        await pool.query('ROLLBACK');
        console.error('Category Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar categoría' });
    }
};
