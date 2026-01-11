"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const healthController_1 = require("../controllers/healthController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Protected Health Check to verify Tenant Context
router.get('/_healthcheck', authMiddleware_1.authenticate, healthController_1.runHealthCheck);
exports.default = router;
