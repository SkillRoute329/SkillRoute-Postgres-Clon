/**
 * lineaUcot — equivalencia de código de línea IMM ↔ interno UCOT.
 *
 * Regla de dominio (validada por Jonathan, reconfirmada 2026-05-16):
 *   - Líneas largas (3 dígitos, ≥100): IMM y UCOT usan el MISMO código
 *     (300, 306, 316, 328, 329, 330, 370, 396 …).
 *   - Líneas cortas (1-2 dígitos): UCOT prefija con "3" sobre el código
 *     IMM público. Ej.: IMM "17" ≡ UCOT interno "317"; "71" ≡ "371";
 *     "79" ≡ "379". Es la MISMA línea física, dos nombres.
 *
 * Es el patrón ya aplicado y validado en cartones.routes.ts
 * (`'3' || imm = ucot`). Centralizado acá para reutilizar en todo cruce
 * por línea (sustituciones, distribución, demanda↔GPS, etc.) y NO volver
 * a confundir un código prefijado con "otra línea".
 */

/** ¿`a` y `b` son la misma línea física (acepta el prefijo "3" UCOT)? */
export function mismaLinea(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a == null || b == null) return false;
  const x = String(a).trim();
  const y = String(b).trim();
  if (!x || !y) return false;
  if (x === y) return true;
  // Una de las dos puede venir prefijada con "3" (corta UCOT) respecto de
  // la otra (corta IMM). Sólo aplica cuando la corta es de 1-2 dígitos.
  if (`3${x}` === y && /^\d{1,2}$/.test(x)) return true;
  if (`3${y}` === x && /^\d{1,2}$/.test(y)) return true;
  return false;
}
