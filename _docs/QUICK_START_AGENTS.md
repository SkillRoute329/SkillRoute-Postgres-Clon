# 🚀 QUICK START - Módulos Agents & Intelligence

## Estado Actual
✅ Bridge Server creado y listo
✅ Motor de inteligencia competitiva implementado
✅ Datos de ejemplo disponibles
⏳ Integración con STM API oficial (próximo)

---

## 📋 Requisitos

```bash
Node.js >= 18
npm o yarn
Backend corriendo en 3002
```

---

## 🔧 SETUP (3 pasos)

### Paso 1: Instalar dependencias
```bash
cd /backend
npm install
```

### Paso 2: Ejecutar Backend + Bridge SIMULTÁNEAMENTE

**Terminal 1 - Backend principal (puerto 3002):**
```bash
cd /backend
npm run dev
```

**Terminal 2 - Bridge Server (puerto 3099):**
```bash
cd /backend
npm run bridge
```

✅ Deberías ver:
```
✅ Bridge Server escuchando en http://localhost:3099
✅ Backend escuchando en http://localhost:3002
```

### Paso 3: Ejecutar Frontend
```bash
cd /frontend
npm run dev
```

---

## 🧪 Verificar que funciona

### 1. Verificar Bridge Server
```bash
curl http://localhost:3099/health
```

Respuesta esperada:
```json
{
  "ok": true,
  "message": "Bridge Server activo",
  "timestamp": "2026-04-01T21:30:00.000Z"
}
```

### 2. Obtener líneas UCOT
```bash
curl http://localhost:3099/api/lines/ucot
```

Respuesta esperada:
```json
{
  "ok": true,
  "totalLineas": 2,
  "totalBuses": 14,
  "timestamp": "2026-04-01T21:30:00.000Z",
  "lineas": [
    {
      "linea": "17",
      "cantidad": 8,
      "buses": [...]
    },
    {
      "linea": "71",
      "cantidad": 6,
      "buses": [...]
    }
  ]
}
```

### 3. Analizar competencia de una línea
```bash
curl http://localhost:3099/api/analysis/17
```

Respuesta esperada:
```json
{
  "ok": true,
  "linea": "17",
  "resumen": {
    "totalBusesUcot": 8,
    "busesConCompetenciaDirecta": 5,
    "pctFlotaEnDisputa": 62,
    "nivelAlerta": "MEDIA",
    "empresasDetectadas": ["1", "2"]
  },
  "alertas": [...]
}
```

---

## 📱 Acceder a los módulos en Frontend

### Módulo Agents (Agentes Digitales)
```
http://localhost:5173/dashboard/traffic/agents
```

**Lo que deberías ver:**
- ✅ Lista de líneas UCOT (17, 71)
- ✅ Cantidad de buses por línea
- ✅ Estado de servicios activos
- ✅ Evaluación de competencia en tiempo real
- ✅ Recomendaciones tácticas automáticas

### Módulo Intelligence (Inteligencia Competitiva)
```
http://localhost:5173/dashboard/traffic/intelligence
```

**Lo que deberías ver:**
- ✅ Dashboard de competencia por línea
- ✅ Porcentaje de flota en disputa
- ✅ Alertas de competencia (ALTA/MEDIA/BAJA)
- ✅ Posicionamiento de buses en mapa
- ✅ Empresas competidoras detectadas

---

## 🔴 Si algo no funciona

### Error: Bridge no responde
```
Solución:
1. Verificar que Terminal 2 esté corriendo: npm run bridge
2. Verificar puerto 3099 libre: lsof -i :3099
3. Revisar logs del bridge en consola
```

### Error: Frontend no encuentra datos
```
Solución:
1. Abrir DevTools (F12) → Console
2. Buscar errores de conexión a http://localhost:3099
3. Verificar que CompetitorIntelligencePage y DigitalAgentsModule estén en src/pages/traffic/
```

### Error: Backend no responde
```
Solución:
1. Verificar que Terminal 1 esté corriendo: npm run dev
2. Verificar puerto 3002 libre: lsof -i :3002
3. Revisar logs del backend
```

---

## 🎯 PRÓXIMOS PASOS (Producción)

### Fase 1: Integración STM API oficial
```typescript
// En bridge-server.ts, reemplazar MOCK_LINEAS_UCOT con:
const lineasReales = await fetch('https://www.montevideo.gub.uy/app/stm/horarios/')
  .then(r => r.json())
  .then(data => procesarHorarios(data))
```

### Fase 2: Datos IMM en tiempo real
```typescript
// Agregar conexión a API IMM para posiciones GPS reales
const posicionesReales = await obtenerPosicionesIMM()
```

### Fase 3: Publicación en Metropolitano
- Documentar arquitectura
- Demostrar evaluación autónoma
- Incluir métricas de precisión

---

## 📊 Métricas esperadas

| Métrica | Valor | Estado |
|---------|-------|--------|
| Líneas UCOT detectadas | 2+ | ✅ |
| Buses por línea | 6-8 | ✅ |
| Tiempo respuesta análisis | <500ms | ✅ |
| Precisión competencia | >85% | 🔄 |
| Actualización en tiempo real | cada 30s | 🔄 |

---

## 📞 Contacto

Si hay problemas, revisar:
1. `/backend/src/bridge-server.ts` - Lógica del bridge
2. `/frontend/src/pages/traffic/CompetitorIntelligencePage.tsx` - Frontend intelligence
3. `/frontend/src/pages/traffic/DigitalAgentsModule.tsx` - Frontend agents
4. Logs de ambas terminales para errores

---

**Estado:** Funcional para demostración
**Siguiente:** Integración STM API oficial
