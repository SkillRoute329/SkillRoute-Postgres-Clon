
import { Request, Response } from 'express';
import pool from '../db';

export const getNotifications = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const result = await pool.query(
            'SELECT * FROM "Notification" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 50',
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
            'UPDATE "Notification" SET "isRead" = TRUE WHERE "id" = $1 AND "userId" = $2',
            [id, userId]
        );
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Error marking notification:', error);
        res.status(500).json({ message: 'Error al actualizar notificación' });
    }
};

// Helper internal function
export const createNotification = async (userId: number, title: string, message: string, type: string = 'INFO', link: string = '') => {
    try {
        await pool.query(
            'INSERT INTO "Notification" ("userId", "title", "message", "type", "link") VALUES ($1, $2, $3, $4, $5)',
            [userId, title, message, type, link]
        );
    } catch (error) {
        console.error('Error creating internal notification:', error);
    }
};
