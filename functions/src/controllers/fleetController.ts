
import { db, storage } from '../config/firebase';
import { Request, Response } from 'express';
import Busboy from 'busboy';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

// --- VEHICLES ---

export const getVehicles = async (req: Request, res: Response) => {
    try {
        const snapshot = await db.collection('vehicles').orderBy('internalNumber').get();
        const vehicles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(vehicles);
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const createVehicle = async (req: Request, res: Response) => {
    try {
        const data = req.body;
        // Validate duplicates?
        const ref = await db.collection('vehicles').add({
            ...data,
            createdAt: new Date().toISOString()
        });
        res.status(201).json({ id: ref.id, ...data });
    } catch (error: any) {
        res.status(500).json({ message: error.message });
    }
};

export const getRotationSchemes = async (req: Request, res: Response) => {
    try {
        // Mock or Fetch
        res.json([
            { id: 1, name: 'Normal' },
            { id: 2, name: 'Fin de Semana' }
        ]);
    } catch (e) { res.status(500).json([]); }
};

// --- INSPECTIONS & UPLOADS ---

export const createInspection = async (req: Request, res: Response) => {
    if (req.method !== 'POST') {
        return res.status(405).end();
    }

    const busboy = Busboy({ headers: req.headers });
    const tmpdir = os.tmpdir();
    const fields: any = {};
    const uploads: any = {};
    const fileWrites: Promise<any>[] = [];

    // 1. Process Fields
    busboy.on('field', (fieldname: string, val: any) => {
        fields[fieldname] = val;
    });

    // 2. Process Files
    busboy.on('file', (fieldname: string, file: any, filename: string, encoding: string, mimetype: string) => {
        const filepath = path.join(tmpdir, filename);
        const writeStream = fs.createWriteStream(filepath);

        file.pipe(writeStream);

        const promise = new Promise((resolve, reject) => {
            file.on('end', () => {
                writeStream.end();
            });
            writeStream.on('finish', async () => {
                try {
                    // Upload to Firebase Storage
                    const bucket = storage.bucket();
                    const destination = `uploads/inspections/${Date.now()}_${filename}`;

                    await bucket.upload(filepath, {
                        destination,
                        metadata: { contentType: mimetype }
                    });

                    // Make public (or sign URL)
                    const fileObj = bucket.file(destination);
                    await fileObj.makePublic();
                    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;

                    uploads[fieldname] = publicUrl;
                    fs.unlinkSync(filepath); // Cleanup
                    resolve(publicUrl);
                } catch (e) {
                    reject(e);
                }
            });
            writeStream.on('error', reject);
        });

        fileWrites.push(promise);
    });

    busboy.on('finish', async () => {
        try {
            await Promise.all(fileWrites);

            // 3. Save to Firestore
            const inspectionData = {
                ...fields,
                // Assuming fields has 'vehicleId', 'date', etc.
                // Map photos to fields
                ...uploads,
                createdAt: new Date().toISOString(),
                userId: (req as any).user?.uid,
                status: 'Completed'
            };

            // Handle 'newDamages' parsing if it's stringified JSON
            if (fields.newDamages) {
                try {
                    const parsed = JSON.parse(fields.newDamages);
                    // Map photo URLs to damage items if implicit
                    inspectionData.damages = parsed.map((d: any, idx: number) => ({
                        ...d,
                        photoUrl: uploads[`damage_${idx}_photo`] || d.photoUrl
                    }));
                } catch (e) { }
            }

            const ref = await db.collection('inspections').add(inspectionData);
            res.status(201).json({ id: ref.id, ...inspectionData });

        } catch (error: any) {
            console.error(error);
            res.status(500).json({ message: error.message });
        }
    });

    // Pipe request to busboy
    // Cloud Functions raw body handling quirks:
    // If using 'express', req.pipe(busboy) works IF body-parser is NOT used or configured for raw.
    // In index.ts we used express.json(). This consumes the stream.
    // WORKAROUND: check 'req.rawBody' (Google Functions specific) OR assume busboy can use req if stream readable.
    // If express.json() ran, req is consumed. 
    // We need to pass { rawBody: req.rawBody } to busboy if available, or rely on 'req.pipe' if not consumed.

    // Safer: Use 'busboy.end(req.rawBody)' if available.
    if ((req as any).rawBody) {
        busboy.end((req as any).rawBody);
    } else {
        req.pipe(busboy);
    }

    return; // Explicit return to satisfy Not all code paths return a value
};
