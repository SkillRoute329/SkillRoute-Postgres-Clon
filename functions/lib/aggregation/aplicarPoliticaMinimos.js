"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aplicarPoliticaMinimos = aplicarPoliticaMinimos;
// Política de mínimos — Decisión 2 del documento arquitectural
// SPEC_CUMPLIMIENTO_V2_BACKEND_2026_05.md §7
const wilsonIC95_1 = require("./wilsonIC95");
function formatValue(val, unit) {
    if (unit === 'pct')
        return `${val.toFixed(1)}%`;
    if (unit === 'min')
        return `${val.toFixed(1)} min`;
    if (unit === 'ratio')
        return val.toFixed(3);
    if (unit === 'score')
        return val.toFixed(1);
    return String(Math.round(val));
}
function aplicarPoliticaMinimos(p) {
    var _a, _b, _c, _d, _e;
    const base = {
        unit: p.unit,
        tipoDato: p.tipoDato,
        fuente: p.fuente,
        formula: p.formula,
        estandar: p.estandar,
    };
    if (p.cobertura < p.cobMinima) {
        return Object.assign(Object.assign({}, base), { value: null, displayValue: '—', n: p.n, ic95Low: null, ic95High: null, coverageGps: p.cobertura, badge: 'NO_COVERAGE' });
    }
    if (p.n < p.nMinimo) {
        return Object.assign(Object.assign({}, base), { value: null, displayValue: '—', n: p.n, ic95Low: null, ic95High: null, coverageGps: p.cobertura, badge: 'INSUFFICIENT' });
    }
    const val = (_a = p.valorRaw) !== null && _a !== void 0 ? _a : 0;
    const ic = p.unit === 'pct' ? (0, wilsonIC95_1.wilsonIC95)(val, p.n) : null;
    if (p.n < 200) {
        return Object.assign(Object.assign({}, base), { value: val, displayValue: formatValue(val, p.unit), n: p.n, ic95Low: (_b = ic === null || ic === void 0 ? void 0 : ic.lo) !== null && _b !== void 0 ? _b : null, ic95High: (_c = ic === null || ic === void 0 ? void 0 : ic.hi) !== null && _c !== void 0 ? _c : null, coverageGps: p.cobertura, badge: 'IC_VISIBLE' });
    }
    return Object.assign(Object.assign({}, base), { value: val, displayValue: formatValue(val, p.unit), n: p.n, ic95Low: (_d = ic === null || ic === void 0 ? void 0 : ic.lo) !== null && _d !== void 0 ? _d : null, ic95High: (_e = ic === null || ic === void 0 ? void 0 : ic.hi) !== null && _e !== void 0 ? _e : null, coverageGps: p.cobertura, badge: 'OK' });
}
