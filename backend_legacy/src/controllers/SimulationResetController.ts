
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const SimulationResetController = {
    reset: async (req: Request, res: Response) => {
        try {
            console.log("🧹 Reseting Simulation Data...");

            // DELETE ONLY SIMULATION DATA
            // Alerts
            await prisma.roadAlert.deleteMany({ where: { type: 'SIMULATION' } });

            // Note: In a real app we'd delete GPS history, driver scores, etc.
            // For now, Alerts is the main artifact.

            res.json({ success: true, message: 'Simulación reiniciada. Datos maestros intactos.' });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: String(error) });
        }
    }
};
