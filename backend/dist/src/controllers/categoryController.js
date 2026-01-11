"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCategoryPrice = exports.getAllCategories = void 0;
const db_1 = __importDefault(require("../db"));
const getAllCategories = async (_req, res) => {
    try {
        const result = await db_1.default.query('SELECT * FROM "ShiftCategory" ORDER BY name ASC');
        res.json(result.rows);
    }
    catch (error) {
        console.error('Category Get Error:', error);
        res.status(500).json({ message: 'Error al obtener categorías' });
    }
};
exports.getAllCategories = getAllCategories;
const updateCategoryPrice = async (req, res) => {
    const { id } = req.params;
    const { baseValue, extraHourValue } = req.body;
    try {
        await db_1.default.query('UPDATE "ShiftCategory" SET "baseValue" = $1, "extraHourValue" = $2, "updatedAt" = NOW() WHERE id = $3', [baseValue, extraHourValue || 0, id]);
        res.json({ message: 'Category price updated' });
    }
    catch (error) {
        console.error('Category Update Error:', error);
        res.status(500).json({ message: 'Error al actualizar precio' });
    }
};
exports.updateCategoryPrice = updateCategoryPrice;
//# sourceMappingURL=categoryController.js.map