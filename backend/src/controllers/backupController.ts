
import { Request, Response } from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

export const createBackup = async (req: Request, res: Response) => {
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `backup-${date}.sql`;
    const dbUrl = process.env.DATABASE_URL;

    if (!dbUrl) {
        return res.status(500).json({ error: 'DATABASE_URL not configured' });
    }

    // Use pg_dump with the connection string directly
    const command = `pg_dump "${dbUrl}" --no-owner --no-acl --clean --if-exists`;

    console.log(`📦 [BACKUP] Starting backup generation: ${filename}`);

    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-Type', 'application/sql');

    const dumpProcess = exec(command);

    if (dumpProcess.stdout) {
        dumpProcess.stdout.pipe(res);
    } else {
        res.status(500).json({ error: "Failed to spawn dump process" });
        return;
    }

    dumpProcess.stderr?.on('data', (data) => {
        console.error(`📦 [BACKUP ERROR]: ${data}`);
    });

    dumpProcess.on('exit', (code) => {
        if (code !== 0) {
            console.error(`📦 [BACKUP FAILED] Exit code: ${code}`);
            // If headers definitely sent, we can't send JSON error now, stream will just end.
        } else {
            console.log('📦 [BACKUP SUCCESS]');
        }
    });
};
