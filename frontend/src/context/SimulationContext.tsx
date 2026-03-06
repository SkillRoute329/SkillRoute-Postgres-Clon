import React, { createContext, useContext, useState, useEffect } from 'react';

interface SimulationContextType {
  isSimulation: boolean;
  enableSimulation: () => void;
  disableSimulation: () => void;
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSimulation, setIsSimulation] = useState(false);

  // Persist simulation state logic if needed, but usually strictly ephemeral for "Session".
  // We will keep it in memory state for security, reset on refresh unless we want persistence.
  // User asked "enter without credentials", implies a session.

  const enableSimulation = () => {
    console.warn('⚠️ ALERTA: MODO SIMULACIÓN ACTIVADO');
    setIsSimulation(true);
    // Set a flag in sessionStorage to survive page reloads if we want,
    // but for safety, better to keep it React state or check session storage on mount.
    sessionStorage.setItem('TRANSFORMA_SIMULATION_MODE', 'true');
  };

  const disableSimulation = () => {
    setIsSimulation(false);
    sessionStorage.removeItem('TRANSFORMA_SIMULATION_MODE');
  };

  useEffect(() => {
    if (sessionStorage.getItem('TRANSFORMA_SIMULATION_MODE') === 'true') {
      setIsSimulation(true);
    }
  }, []);

  return (
    <SimulationContext.Provider value={{ isSimulation, enableSimulation, disableSimulation }}>
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    // Fallback for when used outside provider (rare but safe)
    return { isSimulation: false, enableSimulation: () => {}, disableSimulation: () => {} };
  }
  return context;
};
