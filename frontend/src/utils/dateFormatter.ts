/**
 * dateFormatter.ts — Utilidad global de internacionalización para fechas.
 *
 * Utiliza Intl.DateTimeFormat nativo del navegador, detectando la zona y el
 * idioma preferido del usuario de forma dinámica en lugar de hardcodear 'es-UY'.
 * Si el usuario prefiere otro idioma o formato, el sistema escalará automáticamente.
 */

const getLocale = (): string => {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'es-UY';
};

/**
 * Formatea una fecha o string a formato de hora local (ej. 14:30).
 */
export function formatTime(dateInput: Date | string | number): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    
    return new Intl.DateTimeFormat(getLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Formatea una fecha o string a formato de fecha larga (ej. miércoles, 22 de julio de 2026).
 */
export function formatDateLong(dateInput: Date | string | number): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    
    return new Intl.DateTimeFormat(getLocale(), {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  } catch {
    return '';
  }
}

/**
 * Formatea a formato corto (ej. 22/07/2026).
 */
export function formatDateShort(dateInput: Date | string | number): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    
    return new Intl.DateTimeFormat(getLocale(), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return '';
  }
}
