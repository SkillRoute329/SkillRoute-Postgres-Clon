"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createNotification = exports.markAsRead = exports.getNotifications = void 0;
const db_1 = __importDefault(require("../db"));
const getNotifications = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db_1.default.query('SELECT * FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50', [userId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
};
exports.getNotifications = getNotifications;
const markAsRead = async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    try {
        await db_1.default.query('UPDATE "Notification" SET "isRead" = TRUE WHERE "id" = $1 AND "userId" = $2', [id, userId]);
        res.json({ message: 'Marked as read' });
    }
    catch (error) {
        console.error('Error marking notification:', error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};
exports.markAsRead = markAsRead;
// Helper internal function
const createNotification = async (userId, title, message, type = 'INFO', link = '') => {
    try {
        await db_1.default.query('INSERT INTO "Notification" ("userId", "title", "message", "type", "link") VALUES ($1, $2, $3, $4, $5)', [userId, title, message, type, link]);
    }
    catch (error) {
        console.error('Error creating internal notification:', error);
    }
};
exports.createNotification = createNotification;
//# sourceMappingURL=notificationController.js.map