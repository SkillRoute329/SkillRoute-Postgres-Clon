
import { Request, Response } from 'express';
import pool from '../db';

export const getNotifications = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const result = await pool.query(
            'SELECT id, userid as "userId", message, read, "createdAt" FROM "Notification" WHERE userid = $1 ORDER BY "createdAt" DESC LIMIT 50',
            [userId]
        );
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error al obtener notificaciones' });
    }
};

export const markAsRead = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { id } = req.params;
    try {
        await pool.query(
            'UPDATE "Notification" SET read = TRUE WHERE id = $1 AND userid = $2',
            [id, userId]
        );
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Error marking notification:', error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};

// Helper internal function (Simplified Schema)
export const createNotification = async (userId: number, message: string) => {
    try {
        await pool.query(
            'INSERT INTO "Notification" (userid, message, read) VALUES ($1, $2, FALSE)',
            [userId, message]
        );
    } catch (error) {
        console.error('Error creating internal notification:', error);
    }
};
