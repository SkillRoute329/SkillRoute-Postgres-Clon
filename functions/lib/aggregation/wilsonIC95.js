"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wilsonIC95 = wilsonIC95;
// Wilson score interval (IC binomial estándar) — TCRP 165, TfL EWT methodology
// Retorna valores entre 0 y 1 (el frontend convierte a porcentaje multiplicando por 100)
function wilsonIC95(pct, n) {
    if (n === 0)
        return { lo: 0, hi: 1 };
    const p = Math.max(0, Math.min(1, pct / 100));
    const z = 1.96;
    const denom = 1 + (z * z) / n;
    const center = (p + (z * z) / (2 * n)) / denom;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
    return {
        lo: Math.max(0, center - margin),
        hi: Math.min(1, center + margin),
    };
}
