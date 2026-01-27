"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInspection = exports.getRotationSchemes = exports.createVehicle = exports.getVehicles = void 0;
const firebase_1 = require("../config/firebase");
const busboy_1 = __importDefault(require("busboy"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
// --- VEHICLES ---
const getVehicles = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection('vehicles').orderBy('internalNumber').get();
        const vehicles = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(vehicles);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getVehicles = getVehicles;
const createVehicle = async (req, res) => {
    try {
        const data = req.body;
        // Validate duplicates?
        const ref = await firebase_1.db.collection('vehicles').add(Object.assign(Object.assign({}, data), { createdAt: new Date().toISOString() }));
        res.status(201).json(Object.assign({ id: ref.id }, data));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createVehicle = createVehicle;
const getRotationSchemes = async (req, res) => {
    try {
        // Mock or Fetch
        res.json([
            { id: 1, name: 'Normal' },
            { id: 2, name: 'Fin de Semana' }
        ]);
    }
    catch (e) {
        res.status(500).json([]);
    }
};
exports.getRotationSchemes = getRotationSchemes;
// --- INSPECTIONS & UPLOADS ---
const createInspection = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end();
    }
    const busboy = (0, busboy_1.default)({ headers: req.headers });
    const tmpdir = os.tmpdir();
    const fields = {};
    const uploads = {};
    const fileWrites = [];
    // 1. Process Fields
    busboy.on('field', (fieldname, val) => {
        fields[fieldname] = val;
    });
    // 2. Process Files
    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
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
                    const bucket = firebase_1.storage.bucket();
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
                }
                catch (e) {
                    reject(e);
                }
            });
            writeStream.on('error', reject);
        });
        fileWrites.push(promise);
    });
    busboy.on('finish', async () => {
        var _a;
        try {
            await Promise.all(fileWrites);
            // 3. Save to Firestore
            const inspectionData = Object.assign(Object.assign(Object.assign({}, fields), uploads), { createdAt: new Date().toISOString(), userId: (_a = req.user) === null || _a === void 0 ? void 0 : _a.uid, status: 'Completed' });
            // Handle 'newDamages' parsing if it's stringified JSON
            if (fields.newDamages) {
                try {
                    const parsed = JSON.parse(fields.newDamages);
                    // Map photo URLs to damage items if implicit
                    inspectionData.damages = parsed.map((d, idx) => (Object.assign(Object.assign({}, d), { photoUrl: uploads[`damage_${idx}_photo`] || d.photoUrl })));
                }
                catch (e) { }
            }
            const ref = await firebase_1.db.collection('inspections').add(inspectionData);
            res.status(201).json(Object.assign({ id: ref.id }, inspectionData));
        }
        catch (error) {
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
    if (req.rawBody) {
        busboy.end(req.rawBody);
    }
    else {
        req.pipe(busboy);
    }
    return; // Explicit return to satisfy Not all code paths return a value
};
exports.createInspection = createInspection;
//# sourceMappingURL=fleetController.js.map