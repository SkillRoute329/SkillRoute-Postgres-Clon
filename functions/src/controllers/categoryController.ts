
import { db } from '../config/firebase';
import { Request, Response } from 'express';

export const getCategories = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('vehicle_categories').get();
        const categories = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(categories);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createCategory = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        const ref = await db.collection('vehicle_categories').add(data);
        res.status(201).json({ id: ref.id, ...data });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
