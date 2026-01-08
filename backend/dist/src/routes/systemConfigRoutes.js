"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const systemConfigController_1 = require("../controllers/systemConfigController");
const authMiddleware_1 = require("../middleware/authMiddleware"); // Assuming this exists
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.authenticate, systemConfigController_1.getSystemConfig);
router.post('/', authMiddleware_1.authenticate, systemConfigController_1.updateSystemConfig);
router.post('/init-schema', systemConfigController_1.initSchema); // Open for now to run easily, or protect if desired
exports.default = router;
//# sourceMappingURL=systemConfigRoutes.js.map