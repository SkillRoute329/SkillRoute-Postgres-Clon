"use strict";
/**
 * Registro de reglas por empresa
 * ================================
 * Para agregar una empresa nueva: importar sus reglas y agregarlas al mapa.
 * El motor busca por empresaId (string: '70', '50', '20', '10').
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerReglasEmpresa = obtenerReglasEmpresa;
exports.empresasConReglas = empresasConReglas;
const ucot_1 = require("./ucot");
const REGISTRO = {
    '70': ucot_1.ucotReglas,
    // '50': cutcsaReglas,   // TODO: cuando se integre CUTCSA
    // '20': comeReglas,     // TODO: cuando se integre COME
    // '10': coetcReglas,    // TODO: cuando se integre COETC
};
function obtenerReglasEmpresa(empresaId) {
    var _a;
    return (_a = REGISTRO[empresaId]) !== null && _a !== void 0 ? _a : null;
}
function empresasConReglas() {
    return Object.keys(REGISTRO);
}
