# Equipo de Agentes — TransformaFacil 2.0

## Agente 1: BRIDGE (backend)
Especialidad: bridge-server.js
Responsabilidad:
  - Mantener los endpoints Express funcionando
  - Gestionar sesiones JSF para horarios STM
  - Calcular frecuencias y análisis de competencia
  - Nunca inventar datos — fetch real o error explícito
Archivos: bridge-server.js

## Agente 2: FRONTEND (UI)
Especialidad: React + TypeScript
Responsabilidad:
  - DigitalAgentsModule.tsx y componentes de traffic/
  - Mostrar datos reales del bridge, nunca simular
  - Manejar estados: loading / error / sin datos / datos reales
  - Badge visible del tipo de día actual
Archivos: frontend/src/pages/traffic/ y components/traffic/

## Agente 3: INTELLIGENCE (análisis)
Especialidad: Lógica de competencia y resolución de días
Responsabilidad:
  - dayTypeResolver: calcular tipo de día en Uruguay
  - Detectar competidores por proximidad GPS (Haversine)
  - Calcular frecuencia real vs programada
  - Feriados y semanas especiales Uruguay 2026
Archivos: src/services/intelligence/

## Agente 4: VALIDATOR (control de calidad)
Especialidad: Verificación de datos reales
Responsabilidad:
  - Antes de cada deploy: correr verificaciones
  - Confirmar que no hay Math.random() en flujo de datos
  - Confirmar que coordenadas están en rango de Montevideo
  - Confirmar que fuente = "STM portal real" (no fallback)
