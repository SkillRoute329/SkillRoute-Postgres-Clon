import type { ServiceData } from '../../utils/ExcelParserV2';

/**
 * @deprecated PROHIBICIÓN DE SIMULACIÓN. No importar en producción.
 * Rotación real: ingesta Excel (R-xxx.xls), Firestore (activeAssignments, personalRotation), ucotMaster.
 */
// MOCK ROTATION DATA - DO NOT USE IN PRODUCTION
export const MOCK_ROTATION_DATA: ServiceData[] = [
  // Column 1
  {
    serviceNumber: '1006',
    vehicleInternalNumber: '64',
    startTime: '4:00',
    lineCode: '300b',
    destination: 'INSTRUCCIONES',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1129',
    vehicleInternalNumber: '115',
    startTime: '4:00',
    lineCode: '329h',
    destination: 'MELILLA',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1148',
    vehicleInternalNumber: '140',
    startTime: '4:00',
    lineCode: '330r',
    destination: 'Ruta 6 y 17 mts',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1109',
    vehicleInternalNumber: '58',
    startTime: '4:01',
    lineCode: '306h',
    destination: 'CURVA DE TABAREZ',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1131',
    vehicleInternalNumber: '152',
    startTime: '4:01',
    lineCode: '370h',
    destination: 'PLAYA DEL CERRO',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1103',
    vehicleInternalNumber: '38',
    startTime: '4:10',
    lineCode: '300h',
    destination: 'INSTRUCCIONES',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1119',
    vehicleInternalNumber: '95',
    startTime: '4:10',
    lineCode: '317h',
    destination: 'AROCENA Y OTERO',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1048',
    vehicleInternalNumber: '167',
    startTime: '4:10',
    lineCode: '329p',
    destination: 'MENDOZA E INSTRUCCIONES',
    durationMinutes: 0,
    routeData: [],
  },

  // Column 2 (Sample from Image)
  {
    serviceNumber: '1017',
    vehicleInternalNumber: '63',
    startTime: '4:12',
    lineCode: '306p',
    destination: 'CASABO',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1132',
    vehicleInternalNumber: '7',
    startTime: '4:15',
    lineCode: '370h',
    destination: 'PORTONES',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1038',
    vehicleInternalNumber: '157',
    startTime: '4:15',
    lineCode: '316p',
    destination: 'KILOMETRO 16',
    durationMinutes: 0,
    routeData: [],
  },

  // ... More samples simulating the density
  {
    serviceNumber: '1136',
    vehicleInternalNumber: '36',
    startTime: '4:20',
    lineCode: '330r',
    destination: 'Ruta 6 y 17 mts',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1030',
    vehicleInternalNumber: '105',
    startTime: '4:20',
    lineCode: '306p',
    destination: 'CASABO',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1092',
    vehicleInternalNumber: '99',
    startTime: '4:25',
    lineCode: '396',
    destination: 'MENDOZA E INSTRUCCIONES',
    durationMinutes: 0,
    routeData: [],
  },

  // CORTADOS Section (Shift Change / Cut)
  {
    serviceNumber: '1203',
    vehicleInternalNumber: '226',
    startTime: '13:15',
    lineCode: 'XA2',
    destination: 'PINAR (CORTADO)',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1039',
    vehicleInternalNumber: '157',
    startTime: '14:05',
    lineCode: '316p',
    destination: '8 DE OCTUBRE Y CORRALES',
    durationMinutes: 0,
    routeData: [],
  },

  // NOCTURNOS Section
  {
    serviceNumber: '1151',
    vehicleInternalNumber: '143',
    startTime: '23:16',
    lineCode: '379r',
    destination: 'INTERCAMBIADOR BELLONI',
    durationMinutes: 0,
    routeData: [],
  },
  {
    serviceNumber: '1068',
    vehicleInternalNumber: '46',
    startTime: '23:26',
    lineCode: '306p',
    destination: 'PORTONES',
    durationMinutes: 0,
    routeData: [],
  },
];
