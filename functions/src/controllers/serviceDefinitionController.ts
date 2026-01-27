
import { db } from '../config/firebase';
import { Request, Response } from 'express';

export const getServiceDefinitions = async (req: Request, res: Response) => {
    try {
        const { categoryId } = req.query;
        let query: FirebaseFirestore.Query = db.collection('service_definitions');

        if (categoryId) {
            query = query.where('categoryId', '==', categoryId);
        }

        const snapshot = await query.get();
        const services = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(services);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createServiceDefinition = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        // Use serviceNumber as ID if possible to ensure uniqueness easily
        const id = data.serviceNumber ? `svc_${data.serviceNumber}` : undefined;

        if (id) {
            await db.collection('service_definitions').doc(id).set(data, { merge: true });
            res.status(201).json({ id, ...data });
        } else {
            const ref = await db.collection('service_definitions').add(data);
            res.status(201).json({ id: ref.id, ...data });
        }
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getNextRotation = async (req: Request, res: Response) => {
    try {
        const { currentServiceId } = req.params;
        const svcDoc = await db.collection('service_definitions').doc(currentServiceId as string).get();

        if (!svcDoc.exists) {
            res.status(404).json({ message: 'Service not found' });
            return;
        }

        const current = svcDoc.data();
        const nextId = current?.nextServiceId;

        if (!nextId) {
            res.json({ next: null });
            return;
        }

        const nextDoc = await db.collection('service_definitions').doc(nextId).get();
        res.json({ current, next: nextDoc.data() });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
