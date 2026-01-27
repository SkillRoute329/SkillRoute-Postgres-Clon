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
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateShift = exports.deleteShift = exports.updateShiftStatus = exports.createShift = exports.getAllShifts = void 0;
const firebase_1 = require("../config/firebase");
const getAllShifts = async (req, res) => {
    var _a;
    try {
        const tenantId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.tenantId) || 1;
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '50');
        // Basic Firestore Pagination (Offset-based is hard, using simple limit for now)
        const snapshot = await firebase_1.db.collection('shifts')
            .where('tenantId', '==', tenantId)
            // .orderBy('date', 'desc') // Requires index
            .limit(limit)
            .get();
        const shifts = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        // Enhance with Denormalized Data (Users/Categories) if missing
        // For V1, we assume data is partly denormalized or frontend can handle IDs
        res.json({
            data: shifts,
            meta: {
                currentPage: page,
                totalItems: shifts.length // partial info
            }
        });
    }
    catch (error) {
        console.error('getAllShifts Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.getAllShifts = getAllShifts;
const createShift = async (req, res) => {
    var _a;
    try {
        const user = req.user;
        const data = req.body;
        const newShift = Object.assign(Object.assign({}, data), { tenantId: user.tenantId, createdBy: user.uid, creatorName: user.name || 'Admin', createdAt: new Date().toISOString(), status: 'Created', isPaid: false });
        // Validate Category & Denormalize Name
        if (data.categoryId) {
            const catDoc = await firebase_1.db.collection('categories').doc(String(data.categoryId)).get();
            if (catDoc.exists) {
                newShift.categoryName = (_a = catDoc.data()) === null || _a === void 0 ? void 0 : _a.name;
            }
        }
        const ref = await firebase_1.db.collection('shifts').add(newShift);
        res.status(201).json(Object.assign({ id: ref.id }, newShift));
    }
    catch (error) {
        console.error('createShift Error:', error);
        res.status(500).json({ message: error.message });
    }
};
exports.createShift = createShift;
const updateShiftStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, assignedTo } = req.body;
        const updates = { status, updatedAt: new Date().toISOString() };
        if (assignedTo) {
            updates.assignedTo = assignedTo; // Assuming ID
            // Fetch Assignee Name for denormalization
            const userDoc = await firebase_1.db.collection('users').doc(String(assignedTo)).get();
            if (userDoc.exists) {
                const u = userDoc.data();
                updates.assigneeName = (u === null || u === void 0 ? void 0 : u.fullName) || `${u === null || u === void 0 ? void 0 : u.firstName} ${u === null || u === void 0 ? void 0 : u.lastName}`;
                updates.assigneeInternalNumber = u === null || u === void 0 ? void 0 : u.internalNumber;
            }
        }
        if (status === 'Completed') {
            // Fetch current to check previous status
            const currentDoc = await firebase_1.db.collection('shifts').doc(id).get();
            const currentData = currentDoc.data();
            if (currentData && currentData.status !== 'Completed' && assignedTo) {
                try {
                    const { PayrollService } = await Promise.resolve().then(() => __importStar(require('../services/payrollService')));
                    const extraHours = Number(currentData.extraHours || 0);
                    const financials = await PayrollService.accrueSalary(id, String(assignedTo), extraHours);
                    console.log(`💰 Salario devengado (Firestore) para turno #${id}: $${financials === null || financials === void 0 ? void 0 : financials.netSalary}`);
                }
                catch (payError) {
                    console.error('Payroll Accrual Error:', payError);
                }
            }
        }
        await firebase_1.db.collection('shifts').doc(id).update(updates);
        res.json(Object.assign({ id }, updates));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateShiftStatus = updateShiftStatus;
const deleteShift = async (req, res) => {
    try {
        const { id } = req.params;
        await firebase_1.db.collection('shifts').doc(id).delete();
        res.json({ message: 'Deleted' });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.deleteShift = deleteShift;
const updateShift = async (req, res) => {
    try {
        const { id } = req.params;
        await firebase_1.db.collection('shifts').doc(id).update(Object.assign(Object.assign({}, req.body), { updatedAt: new Date().toISOString() }));
        res.json(Object.assign({ id }, req.body));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.updateShift = updateShift;
//# sourceMappingURL=shiftController.js.map