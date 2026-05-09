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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregationEngineNow = exports.aggregationEngineCron = void 0;
// Export del trigger Cloud Scheduler para aggregation-engine
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §3.1
const functions = __importStar(require("firebase-functions/v1"));
const aggregationEngine_1 = require("./aggregationEngine");
// Cron diario 03:00 UY (= 06:00 UTC porque UY es UTC-3)
// Los lunes también calcula WEEKLY; el 1º de mes también MONTHLY.
exports.aggregationEngineCron = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .pubsub.schedule('0 6 * * *')
    .timeZone('UTC')
    .onRun(async () => {
    try {
        const result = await (0, aggregationEngine_1.runAggregation)();
        console.log('[AggregationEngine] Completado:', JSON.stringify(result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[AggregationEngine] Error fatal:', msg);
    }
    return null;
});
// HTTP trigger para ejecución manual / testing
exports.aggregationEngineNow = functions
    .runWith({ timeoutSeconds: 540, memory: '1GB' })
    .https.onRequest(async (req, res) => {
    const targetDate = req.query.date;
    try {
        const result = await (0, aggregationEngine_1.runAggregation)(targetDate);
        res.json(Object.assign({ ok: true }, result));
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ ok: false, error: msg });
    }
});
