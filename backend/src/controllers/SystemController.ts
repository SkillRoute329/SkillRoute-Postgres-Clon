
import { Request, Response } from 'express';
import { SYSTEM_MODULES } from '../config/SystemManifest';

export const SystemController = {
    getMenu: async (req: Request, res: Response) => {
        try {
            const user = (req as any).user;

            // 🔒 SECURITY CHECK
            if (!user) {
                return res.status(401).json({ message: "Identity Unknown" });
            }

            console.log(`🧭 SYSTEM: Generating Menu for ${user.email || user.internalNumber} (${user.role})`);

            // ⚡ GOD MODE CHECK
            if (user.metadata?.type === 'GOD_MODE' || user.email === '0000' || user.internalNumber === '0000') {
                console.log("⚡ GOD MODE DETECTED: Returning Full System Manifest.");
                return res.json({ modules: SYSTEM_MODULES });
            }

            // Normal User Filtering
            const filteredModules = SYSTEM_MODULES.filter(module => {
                // Check if user role matches any of module allowed roles
                return module.roles.includes(user.role) || user.role === 'SUPER_ADMIN';
            });

            return res.json({ modules: filteredModules });

        } catch (error) {
            console.error("❌ CLOUD MENU FAILED:", error);
            return res.status(500).json({ message: "Menu Generation Failed", error: String(error) });
        }
    }
};
