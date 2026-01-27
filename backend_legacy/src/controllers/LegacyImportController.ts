
import { Request, Response } from 'express';

export const LegacyImportController = {
    upload: async (req: Request, res: Response) => {
        try {
            console.log('[LEGACY] Upload called (Placeholder)');
            res.json({ message: "Importación legacy simulada con éxito (Placeholder)" });
        } catch (error) {
            console.error('[LEGACY] Error in upload:', error);
            res.status(500).json({ error: "Error en importación" });
        }
    },
    audit: async (req: Request, res: Response) => {
        try {
            console.log('[LEGACY] Audit called (Placeholder)');
            res.json({ logs: [], message: "Auditoría legacy simulada." });
        } catch (error) {
            console.error('[LEGACY] Error in audit:', error);
            res.status(500).json({ error: "Error en auditoría" });
        }
    }
};
