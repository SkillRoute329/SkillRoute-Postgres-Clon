
import { db } from '../config/firebase';
import { Request, Response } from 'express';

// Interfaces (Simplified)
export interface Shift {
    id?: string;
    tenantId: number;
    categoryId: number;
    serviceNumber: string;
    date: string;
    time: string;
    endTime?: string;
    line?: string;
    carNumber?: string;
    status: string;
    [key: string]: any;
}

export const getAllShifts = async (req: Request, res: Response) => {
    try {
        const tenantId = (req as any).user?.tenantId || 1;
        const page = parseInt((req.query.page as string) || '1');
        const limit = parseInt((req.query.limit as string) || '50');

        // Basic Firestore Pagination (Offset-based is hard, using simple limit for now)
        const snapshot = await db.collection('shifts')
            .where('tenantId', '==', tenantId)
            // .orderBy('date', 'desc') // Requires index
            .limit(limit)
            .get();

        const shifts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Enhance with Denormalized Data (Users/Categories) if missing
        // For V1, we assume data is partly denormalized or frontend can handle IDs

        res.json({
            data: shifts,
            meta: {
                currentPage: page,
                totalItems: shifts.length // partial info
            }
        });
    } catch (error: any) {
        console.error('getAllShifts Error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const createShift = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const data = req.body;

        const newShift: any = {
            ...data,
            tenantId: user.tenantId,
            createdBy: user.uid,
            creatorName: user.name || 'Admin', // Fallback
            createdAt: new Date().toISOString(),
            status: 'Created',
            isPaid: false
        };

        // Validate Category & Denormalize Name
        if (data.categoryId) {
            const catDoc = await db.collection('categories').doc(String(data.categoryId)).get();
            if (catDoc.exists) {
                newShift.categoryName = catDoc.data()?.name;
            }
        }

        const ref = await db.collection('shifts').add(newShift);
        res.status(201).json({ id: ref.id, ...newShift });

    } catch (error: any) {
        console.error('createShift Error:', error);
        res.status(500).json({ message: error.message });
    }
};

export const updateShiftStatus = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { status, assignedTo } = req.body;

        const updates: any = { status, updatedAt: new Date().toISOString() };

        if (assignedTo) {
            updates.assignedTo = assignedTo; // Assuming ID
            // Fetch Assignee Name for denormalization
            const userDoc = await db.collection('users').doc(String(assignedTo)).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                updates.assigneeName = u?.fullName || `${u?.firstName} ${u?.lastName}`;
                updates.assigneeInternalNumber = u?.internalNumber;
            }
        }
        if (status === 'Completed') {
            // Fetch current to check previous status
            const currentDoc = await db.collection('shifts').doc(id as string).get();
            const currentData = currentDoc.data();

            if (currentData && currentData.status !== 'Completed' && assignedTo) {
                try {
                    const { PayrollService } = await import('../services/payrollService');
                    const extraHours = Number(currentData.extraHours || 0);
                    const financials = await PayrollService.accrueSalary(id as string, String(assignedTo), extraHours);
                    console.log(`💰 Salario devengado (Firestore) para turno #${id}: $${financials?.netSalary}`);
                } catch (payError) {
                    console.error('Payroll Accrual Error:', payError);
                }
            }
        }

        await db.collection('shifts').doc(id as string).update(updates);
        res.json({ id, ...updates });

    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const deleteShift = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.collection('shifts').doc(id as string).delete();
        res.json({ message: 'Deleted' });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const updateShift = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        await db.collection('shifts').doc(id as string).update({
            ...req.body,
            updatedAt: new Date().toISOString()
        });
        res.json({ id, ...req.body });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};
