/**
 * Limpia recursivamente un objeto para Firestore:
 * 1. Aplana arrays anidados (Infinity flat).
 * 2. Elimina undefined y nulls en arrays.
 * 3. Elimina claves con valores undefined.
 * 4. RESPETA los Timestamps de Firestore.
 */
export const deepSanitize = (obj: any): any => {
  // Caso Base: Si es un valor primitivo, devolverlo
  if (obj === undefined) return undefined;
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Caso Especial: Si es un Timestamp de Firestore, NO TOCAR
  if (obj.toMillis && typeof obj.toMillis === 'function') {
    return obj;
  }

  // Caso Especial: Si es un Objeto Date nativo
  if (obj instanceof Date) {
    return obj;
  }

  // Caso Array: Aplanar recursivamente al máximo nivel
  if (Array.isArray(obj)) {
    return obj
      .flat(Infinity) // <--- LA CLAVE: Aplanar todo nivel de anidamiento
      .map((item) => deepSanitize(item)) // Limpiar hijos
      .filter((item) => item !== null && item !== undefined && item !== ''); // Filtrar basura
  }

  // Caso Objeto: Recorrer claves
  const cleaned: any = {};
  Object.keys(obj).forEach((key) => {
    const value = deepSanitize(obj[key]);
    if (value !== undefined) {
      cleaned[key] = value;
    }
  });

  return cleaned;
};
