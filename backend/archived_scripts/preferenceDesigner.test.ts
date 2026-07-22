// Mock simple de logger para evitar dependencias pesadas
const log = {
  info: (msg: string) => console.log(`[INFO] ${msg}`),
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${msg}`),
};

// Función de parseo bajo test (extraída de la lógica de fallback de ai.routes.ts)
export function parsePreferencesFallback(text: string) {
  const nombre = text.substring(0, 30);
  const desc = text;
  
  // Normalizar tildes y mayúsculas
  const normalizedText = text.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const regimen = normalizedText.includes('semana') ? 'semana_semana' : (normalizedText.includes('fijo') ? 'fijo' : '15_15');
  
  let patronDescanso = 'fin_de_semana_rotativo';
  if (normalizedText.includes('sabado')) patronDescanso = 'sabado';
  else if (normalizedText.includes('domingo')) patronDescanso = 'domingo';
  else if (normalizedText.includes('lunes')) patronDescanso = 'lunes';
  else if (normalizedText.includes('martes')) patronDescanso = 'martes';
  else if (normalizedText.includes('miercoles')) patronDescanso = 'miercoles';
  else if (normalizedText.includes('jueves')) patronDescanso = 'jueves';
  else if (normalizedText.includes('viernes')) patronDescanso = 'viernes';

  const maxHoursMatch = text.match(/(\d+)\s*hor/i);
  const maxHours = maxHoursMatch ? Number(maxHoursMatch[1]) : null;

  const minBreakMatch = text.match(/(\d+)\s*min/i);
  const minBreakMinutes = minBreakMatch ? Number(minBreakMatch[1]) : null;

  const avoidSplitShifts = normalizedText.includes('partido') || normalizedText.includes('partida');
  
  const lineMatch = text.match(/l[ií]nea\s*(\w+)/i);
  const lineConstraint = lineMatch ? lineMatch[1] : null;

  return {
    nombre: String(nombre || 'Nueva Regla GenAI').trim(),
    descripcion: String(desc || text),
    regimen: ['15_15', 'semana_semana', 'fijo'].includes(regimen) ? regimen : '15_15',
    patronDescanso: ['fin_de_semana_rotativo', 'sabado', 'domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes'].includes(patronDescanso)
      ? patronDescanso
      : 'fin_de_semana_rotativo',
    maxHours: maxHours != null ? Number(maxHours) : null,
    minBreakMinutes: minBreakMinutes != null ? Number(minBreakMinutes) : null,
    avoidSplitShifts: Boolean(avoidSplitShifts),
    lineConstraint: lineConstraint ? String(lineConstraint) : null,
  };
}

// Suite de Pruebas
function runTests() {
  log.info('Iniciando tests unitarios para Preference Designer Fallback Parser...');
  let passed = 0;
  let failed = 0;

  const testCases = [
    {
      input: 'Limitar los turnos semanales a un máximo de 8 horas de conducción diaria y domingos libres',
      expected: {
        regimen: 'semana_semana',
        patronDescanso: 'domingo',
        maxHours: 8,
        minBreakMinutes: null,
        avoidSplitShifts: false,
        lineConstraint: null
      }
    },
    {
      input: 'Evitar turnos partidos para la línea 121 y asegurar descanso mínimo de 45 minutos',
      expected: {
        regimen: '15_15',
        patronDescanso: 'fin_de_semana_rotativo',
        maxHours: null,
        minBreakMinutes: 45,
        avoidSplitShifts: true,
        lineConstraint: '121'
      }
    },
    {
      input: 'Los conductores en régimen fijo tendrán sábados libres y descanso de 30 mins',
      expected: {
        regimen: 'fijo',
        patronDescanso: 'sabado',
        maxHours: null,
        minBreakMinutes: 30,
        avoidSplitShifts: false,
        lineConstraint: null
      }
    }
  ];

  testCases.forEach((tc, index) => {
    try {
      const result = parsePreferencesFallback(tc.input);
      
      // Validaciones
      const asserts = [
        result.regimen === tc.expected.regimen,
        result.patronDescanso === tc.expected.patronDescanso,
        result.maxHours === tc.expected.maxHours,
        result.minBreakMinutes === tc.expected.minBreakMinutes,
        result.avoidSplitShifts === tc.expected.avoidSplitShifts,
        result.lineConstraint === tc.expected.lineConstraint,
      ];

      if (asserts.every(Boolean)) {
        log.info(`✔ Test Caso ${index + 1} PASSED`);
        passed++;
      } else {
        log.error(`❌ Test Caso ${index + 1} FAILED`);
        console.error('Input:', tc.input);
        console.error('Expected:', tc.expected);
        console.error('Got:', result);
        failed++;
      }
    } catch (err: any) {
      log.error(`❌ Test Caso ${index + 1} arrojó un error inesperado: ${err.message}`);
      failed++;
    }
  });

  log.info(`Resumen de Pruebas: ${passed} pasados, ${failed} fallados.`);
  if (failed > 0) {
    process.exit(1);
  } else {
    log.info('¡Todos los tests pasaron exitosamente!');
    process.exit(0);
  }
}

// Ejecutar tests
runTests();
