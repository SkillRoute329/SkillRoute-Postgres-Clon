import type { ServiceMaster, ServiceCard } from '../../types/transport';

/**
 * @deprecated PROHIBICIÓN DE SIMULACIÓN. No importar en producción.
 * Cartones/servicios reales: CartonService (Firestore) + ucotMaster (ucot_master_intelligence_2026.json).
 * Este archivo solo como referencia de estructura o para tests en __tests__/fixtures.
 */
// MOCKED DATA - DO NOT USE IN PRODUCTION

export const MOCK_SERVICES: ServiceMaster[] = [
  {
    id: '1100',
    line: '329',
    category: 'Hibrido',
    season: 'Verano',
    shifts: [
      {
        shiftIndex: 1,
        startTime: '05:20',
        endTime: '12:00',
        duration: '06:40',
        notes: 'SACA COCHE',
      },
      {
        shiftIndex: 2,
        startTime: '12:00',
        endTime: '20:30',
        duration: '08:30',
        notes: "Rgo. 01:00' SAINT BOIS",
        reliefLocation: 'SAINT BOIS',
      },
    ],
  },
  {
    id: '1110',
    line: '300',
    category: 'Hibrido',
    season: 'Verano',
    shifts: [
      {
        shiftIndex: 1,
        startTime: '06:00',
        endTime: '14:00',
        duration: '08:00',
        notes: 'Inicio Rotación',
      },
    ],
  },
];

export const MOCK_CARTON_2290: ServiceCard = {
  serviceId: '2290',
  line: '370', // From photo
  title: 'SABADERO VERANO 2026 UCOT',
  columns: [
    'Pza.Cerro/Tnal',
    'Tnal Cerro',
    'E. Romero',
    'Agraciada',
    'Uruguay/F.Crespo',
    'L.A.Herrera y Av Italia',
    'Veracierto',
    'Portones',
    'ESPERAS',
  ],
  rows: [
    {
      time: '06:15',
      checkpoints: ['06:15', '06:28', '06:42', '06:53', '07:05', '07:18', '07:33', '07:46', '12'],
    },
    {
      time: '09:42',
      checkpoints: ['09:42', '09:55', '10:09', '10:20', '10:32', '10:45', '11:00', '11:13', '14'],
    },
    {
      time: '13:11',
      checkpoints: ['13:11', '13:24', '13:38', '13:49', '14:01', '14:14', '14:29', '14:42', '14'],
    },
    // The one with the red box in the photo
    {
      time: '11:54',
      checkpoints: ['11:27', '11:39', '11:54', '12:07', '12:18', '12:30', '12:45', '12:58', '13'],
    },
  ],
  footerNotes: 'ES OBLIGACION SALIR CON EXPENDEDORA ENCENDIDA Y CERRAR VENTANILLAS...',
};
