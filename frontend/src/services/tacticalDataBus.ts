/**
 * Bus de Datos Tácticos: Permite comunicación entre el simulador y el radar
 * sin depender obligatoriamente de Firestore (bypass de permisos).
 */

type TacticalListener = (positions: any[]) => void;

class TacticalDataBus {
  private listeners: TacticalListener[] = [];
  private currentPositions: any[] = [];

  subscribe(callback: TacticalListener) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  broadcast(positions: any[]) {
    this.currentPositions = positions;
    this.listeners.forEach((l) => l(positions));
  }

  getLatest() {
    return this.currentPositions;
  }
}

export const tacticalDataBus = new TacticalDataBus();
