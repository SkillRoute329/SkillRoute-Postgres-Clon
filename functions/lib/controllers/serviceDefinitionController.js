"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNextRotation = exports.createServiceDefinition = exports.getServiceDefinitions = void 0;
const firebase_1 = require("../config/firebase");
const getServiceDefinitions = async (req, res) => {
    try {
        const { categoryId } = req.query;
        let query = firebase_1.db.collection('service_definitions');
        if (categoryId) {
            query = query.where('categoryId', '==', categoryId);
        }
        const snapshot = await query.get();
        const services = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(services);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getServiceDefinitions = getServiceDefinitions;
const createServiceDefinition = async (req, res) => {
    try {
        const data = req.body;
        // Use serviceNumber as ID if possible to ensure uniqueness easily
        const id = data.serviceNumber ? `svc_${data.serviceNumber}` : undefined;
        if (id) {
            await firebase_1.db.collection('service_definitions').doc(id).set(data, { merge: true });
            res.status(201).json(Object.assign({ id }, data));
        }
        else {
            const ref = await firebase_1.db.collection('service_definitions').add(data);
            res.status(201).json(Object.assign({ id: ref.id }, data));
        }
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createServiceDefinition = createServiceDefinition;
const getNextRotation = async (req, res) => {
    try {
        const { currentServiceId } = req.params;
        const svcDoc = await firebase_1.db.collection('service_definitions').doc(currentServiceId).get();
        if (!svcDoc.exists) {
            res.status(404).json({ message: 'Service not found' });
            return;
        }
        const current = svcDoc.data();
        const nextId = current === null || current === void 0 ? void 0 : current.nextServiceId;
        if (!nextId) {
            res.json({ next: null });
            return;
        }
        const nextDoc = await firebase_1.db.collection('service_definitions').doc(nextId).get();
        res.json({ current, next: nextDoc.data() });
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getNextRotation = getNextRotation;
//# sourceMappingURL=serviceDefinitionController.js.map