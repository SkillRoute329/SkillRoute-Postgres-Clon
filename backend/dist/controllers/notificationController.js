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
        const result = await db_1.default.query('SELECT id, userid as "userId", message, read, createdat as "createdAt" FROM notification WHERE userid = $1 ORDER BY createdat DESC LIMIT 50', [userId]);
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
        await db_1.default.query('UPDATE notification SET read = TRUE WHERE id = $1 AND userid = $2', [id, userId]);
        res.json({ message: 'Marked as read' });
    }
    catch (error) {
        console.error('Error marking notification:', error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};
exports.markAsRead = markAsRead;
// Helper internal function (Simplified Schema)
const createNotification = async (userId, message) => {
    try {
        await db_1.default.query('INSERT INTO notification (userid, message, read) VALUES ($1, $2, FALSE)', [userId, message]);
    }
    catch (error) {
        console.error('Error creating internal notification:', error);
    }
};
exports.createNotification = createNotification;
