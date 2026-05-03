"use strict";
/**
 * Motor de Consecuencias — SkillRoute
 * ====================================
 * Grafo de dependencias operativas para empresas de transporte.
 * Cada evento dispara efectos en cascada a través de los dominios:
 * RRHH, Nómina, Operaciones, OTP, Subsidio, Finanzas, Disciplina.
 *
 * Diseño:
 *  - El motor es genérico: trabaja con cualquier empresa.
 *  - Las reglas son inyectables: cada empresa implementa CompanyRules.
 *  - La simulación no escribe datos reales (es un "¿qué pasa si...?").
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.propagarEvento = propagarEvento;
function propagarEvento(evento, reglas, contexto) {
    let efectos = [];
    switch (evento.tipo) {
        case 'CONDUCTOR_AUSENTE':
            efectos = reglas.alConductorAusente(evento, contexto);
            break;
        case 'CONDUCTOR_ASIGNADO':
            efectos = reglas.alConductorAsignado(evento, contexto);
            // Agregar desglose salarial como efectos de NOMINA
            const salario = reglas.calcularSalarioTurno(evento);
            efectos.push({
                dominio: 'NOMINA',
                severidad: 'info',
                titulo: 'Salario calculado para el turno',
                descripcion: `Base: ${fmt(salario.base)} + adicionales: ${fmt(Object.values(salario.adicionales).reduce((a, b) => a + b, 0))}`,
                delta: salario.total,
                unidad: 'UYU',
                entidadAfectadaId: evento.conductorId,
                entidadAfectadaTipo: 'CONDUCTOR',
                requiereAccion: false,
            });
            break;
        case 'VEHICULO_FUERA_DE_SERVICIO':
            efectos = reglas.alVehiculoFueraDeServicio(evento, contexto);
            break;
        case 'VIAJE_TARDIO':
            efectos = reglas.alViajeTardio(evento, contexto);
            break;
        case 'VIAJE_CANCELADO':
            efectos = reglas.alViajeCancelado(evento, contexto);
            break;
    }
    const resumen = calcularResumen(efectos, reglas, evento, contexto);
    return {
        evento,
        efectos,
        resumen,
        timestamp: new Date().toISOString(),
    };
}
// ── Helpers internos ──────────────────────────────────────────────────────────
function calcularResumen(efectos, reglas, evento, contexto) {
    const nomina = efectos
        .filter((e) => e.dominio === 'NOMINA' && e.delta !== undefined)
        .reduce((acc, e) => { var _a; return acc + ((_a = e.delta) !== null && _a !== void 0 ? _a : 0); }, 0);
    const subsidio = efectos
        .filter((e) => e.dominio === 'SUBSIDIO' && e.delta !== undefined)
        .reduce((acc, e) => { var _a; return acc + ((_a = e.delta) !== null && _a !== void 0 ? _a : 0); }, 0);
    const otpEfectos = efectos.filter((e) => e.dominio === 'OTP' && e.unidad === '%');
    const deltaOTP = otpEfectos.reduce((acc, e) => { var _a; return acc + ((_a = e.delta) !== null && _a !== void 0 ? _a : 0); }, 0);
    const viajesEnRiesgo = efectos
        .filter((e) => { var _a; return e.unidad === 'viajes' && ((_a = e.delta) !== null && _a !== void 0 ? _a : 0) < 0; })
        .reduce((acc, e) => { var _a; return acc + Math.abs((_a = e.delta) !== null && _a !== void 0 ? _a : 0); }, 0);
    const kmPerdidos = efectos
        .filter((e) => { var _a; return e.unidad === 'km' && ((_a = e.delta) !== null && _a !== void 0 ? _a : 0) < 0; })
        .reduce((acc, e) => { var _a; return acc + Math.abs((_a = e.delta) !== null && _a !== void 0 ? _a : 0); }, 0);
    const hayCritico = efectos.some((e) => e.severidad === 'critico');
    const hayAdvertencia = efectos.some((e) => e.severidad === 'advertencia');
    const severidadGlobal = hayCritico
        ? 'critico'
        : hayAdvertencia
            ? 'advertencia'
            : 'info';
    const requiereIntervencion = efectos.some((e) => e.requiereAccion && e.severidad === 'critico');
    return {
        impactoNomina: nomina,
        impactoSubsidio: subsidio,
        deltaOTP,
        viajesEnRiesgo,
        kmPerdidos,
        severidadGlobal,
        requiereIntervencionInmediata: requiereIntervencion,
    };
}
function fmt(n) {
    return `$${Math.round(n).toLocaleString('es-UY')}`;
}
