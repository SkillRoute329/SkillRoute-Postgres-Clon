"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const categoryController_1 = require("../controllers/categoryController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.get('/', categoryController_1.getAllCategories);
router.put('/:id', authMiddleware_1.authenticate, categoryController_1.updateCategoryPrice);
exports.default = router;
//# sourceMappingURL=categoryRoutes.js.map