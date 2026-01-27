"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCategory = exports.getCategories = void 0;
const firebase_1 = require("../config/firebase");
const getCategories = async (req, res) => {
    try {
        const snapshot = await firebase_1.db.collection('vehicle_categories').get();
        const categories = snapshot.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
        res.json(categories);
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const data = req.body;
        const ref = await firebase_1.db.collection('vehicle_categories').add(data);
        res.status(201).json(Object.assign({ id: ref.id }, data));
    }
    catch (error) {
        res.status(500).json({ message: error.message });
    }
};
exports.createCategory = createCategory;
//# sourceMappingURL=categoryController.js.map