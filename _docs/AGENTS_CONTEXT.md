# TransformaFacil 2.0 — Contexto para Agentes

## Stack
- Frontend: React 19 + Vite 7 + TypeScript — puerto 3005
- Backend bridge: Node.js + Express — puerto 3099
- DB: Firebase Firestore (proyecto: ucot-gestor-cloud)
- Empresa: UCOT (Unión Cooperativa Obrera del Transporte)

## Fuentes de datos públicas VERIFICADAS

### GPS en tiempo real
  URL: https://www.montevideo.gub.uy/buses/rest/stm-online
  Método: POST (body vacío)
  Headers: Referer: https://www.montevideo.gub.uy/buses/
  Respuesta: GeoJSON con buses activos
  UCOT = codigoEmpresa 70
  Coordenadas inválidas: filtrar lat/lng = -258

### Horarios STM
  URL: https://www.montevideo.gub.uy/app/stm/horarios/pages/consultar.xhtml
  Método: POST con sesión JSF
  Requiere: GET previo para obtener cookies + ViewState
  Tipos válidos: 'Hábiles' | 'Sábados' | 'Domingos'
  Respuesta: XML partial-response con tabla HTML en CDATA

## Reglas absolutas
- NUNCA inventar datos de GPS, horarios o competencia
- NUNCA usar Math.random() en flujo de datos
- Si un fetch falla → retornar error explícito, no fallback
- Toda coordenada válida: lat entre -35.5 y -34.0, lng entre -57 y -55

## Archivos clave
- bridge-server.js → lógica de datos (GPS + horarios STM)
- frontend/src/pages/traffic/DigitalAgentsModule.tsx → UI principal
- frontend/src/pages/traffic/CompetitorIntelligencePage.tsx → competencia

## Mapeo de empresas STM
  20 → COME
  30 → COETC  
  50 → CUTCSA
  70 → UCOT

## Estado actual (01/04/2026)
- GPS: ✅ funcionando, 75 buses reales
- Horarios STM: ⚠️ pendiente verificar si usa fallback
- Tipo de día hoy: Semana de Turismo → forzar 'Domingos'
