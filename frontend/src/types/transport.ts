export interface ServiceMaster {
  id: string; // "1100"
  line: string; // "329"
  category: 'Convencional' | 'Hibrido' | 'Electrico' | 'Micro';
  season: 'Invierno' | 'Verano';
  shifts: {
    shiftIndex: 1 | 2 | 3;
    startTime: string; // "05:20"
    endTime: string; // "12:00"
    duration: string; // "06:40"
    notes?: string; // "SACA COCHE", "SAINT BOIS"
    reliefLocation?: string; // "SAINT BOIS"
  }[];
}

export interface CartonRow {
  time: string; // Start time of this specific trip
  checkpoints: (string | null)[]; // Times at each column. Null if express/skip
  isExpress?: boolean;
  isRelief?: boolean;
}

export interface ServiceCard {
  serviceId: string; // "2290"
  line: string; // "370"
  title: string; // "SABADERO VERANO 2026 UCOT"
  columns: string[]; // ["Pza.Cerro/Tnal", "Tnal Cerro", ...]
  rows: CartonRow[];
  footerNotes?: string;
  validFrom?: string;
}
