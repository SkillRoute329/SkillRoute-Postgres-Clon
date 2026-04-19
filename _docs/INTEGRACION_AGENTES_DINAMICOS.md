# Integración de Agentes Dinámicos — TransformaFacil 2.0

## 📋 Descripción General

Se ha implementado un **sistema de agentes dinámicos por línea** que:

1. **Crea automáticamente** ecosistemas de agentes para cada línea (300, 310, 320, etc.)
2. **No requiere consultas** al usuario — generación automática basada en config JSON
3. **Genera alertas** en formato estándar: recorrido, sentido, tiempo, acciones
4. **Expone APIs REST** para integración con frontend

### Arquitectura

```
MasterOrchestrator (gestor central)
├── Línea 300 (ecosystem)
│   ├── Orquestador-300 (coordinador táctico)
│   ├── Analizadores propios (destino/sentido)
│   └── Monitores de competencia (COME, CUTCSA, COETC)
├── Línea 310 (ecosystem)
│   └── [estructura igual]
└── Línea 320 (ecosystem)
    └── [estructura igual]
```

---

## 🚀 Instalación e Integración

### Paso 1: Agregar dependencias (si falta)

```bash
npm install express-async-errors
```

### Paso 2: Integrar en `bridge-server.js`

Añadir al inicio del archivo:

```javascript
const MasterOrchestrator = require('./orchestrators/MasterOrchestrator');
const agentsRoutes = require('./routes/agentsRoutes');
const fs = require('fs');
const path = require('path');

// ... código existente ...

// Inicializar MasterOrchestrator
async function initializeMasterOrchestrator() {
  const configPath = path.join(__dirname, 'config/lineas-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const masterOrchestrator = new MasterOrchestrator(config);
  await masterOrchestrator.initialize();

  app.locals.masterOrchestrator = masterOrchestrator;
  console.log('[Bridge] MasterOrchestrator inicializado');
  return masterOrchestrator;
}

// En la inicialización de Express (en app.listen):
const PORT = process.env.PORT || 3099;
app.listen(PORT, async () => {
  await initializeMasterOrchestrator();
  console.log(`✅ Bridge server escuchando en puerto ${PORT}`);
});
```

### Paso 3: Registrar rutas de agentes

Añadir después de tus rutas existentes (antes de `app.listen`):

```javascript
// Rutas de agentes dinámicos
app.use('/api/agents', agentsRoutes);
```

### Paso 4: Estructura de carpetas requerida

```
backend/
├── agents/
│   └── AgentFactory.js          ← NUEVO
├── orchestrators/
│   ├── MasterOrchestrator.js    ← NUEVO
│   └── AlertGenerator.js        ← NUEVO
├── config/
│   └── lineas-config.json       ← NUEVO
├── routes/
│   └── agentsRoutes.js          ← NUEVO
└── bridge-server.js             ← ACTUALIZAR
```

---

## 📡 Endpoints REST Disponibles

### 1. Estado General

**GET** `/api/agents/status`

Respuesta:
```json
{
  "timestamp": "2026-04-06T14:30:00Z",
  "total_lines": 3,
  "ecosystems": [
    {
      "lineId": 300,
      "lineNombre": "Línea 300",
      "status": "active",
      "totalAgents": 7,
      "orchestrator": "orquestador-300",
      "ownAgents": 2,
      "competitorAgents": 2
    }
  ]
}
```

### 2. Estado de Línea Específica

**GET** `/api/agents/line/300/status`

Respuesta:
```json
{
  "lineId": 300,
  "lineNombre": "Línea 300",
  "status": "active",
  "totalAgents": 7,
  "agents": {
    "orchestrator": "orquestador-300",
    "ownAnalyzers": [
      { "id": "analizador-300-dest_300_ida_centro", "destination": "Centro - Ida", "sentido": "ida" },
      { "id": "analizador-300-dest_300_vuelta_centro", "destination": "Centro - Vuelta", "sentido": "vuelta" }
    ],
    "competitorMonitors": [
      { "id": "monitor-300-vs-come", "competitor": "Línea 100 COME", "empresa": "COME" },
      { "id": "monitor-300-vs-cutcsa", "competitor": "Línea 50 CUTCSA", "empresa": "CUTCSA" }
    ]
  }
}
```

### 3. Generar Alerta Genérica

**POST** `/api/agents/line/300/alert`

Body:
```json
{
  "tipo": "ALERTA_RETRASO",
  "recorrido": "Centro - Ida",
  "sentido": "ida",
  "tiempo_minutos": 7,
  "mensaje": "Congestión en Av. 8 de Octubre",
  "acciones": [
    "Acelerar próximas unidades",
    "Comunicar a central de información"
  ]
}
```

Respuesta:
```json
{
  "alerta_id": "ALERTA_300_20260406143000000",
  "linea": 300,
  "linea_nombre": "Línea 300",
  "tipo": "ALERTA_RETRASO",
  "recorrido": "Centro - Ida",
  "sentido": "ida",
  "tiempo_minutos": 7,
  "timestamp": "2026-04-06T14:30:00.000Z",
  "mensaje": "Congestión en Av. 8 de Octubre",
  "acciones_recomendadas": ["Acelerar próximas unidades", "Comunicar a central de información"],
  "severidad": "MEDIA",
  "fuente": "sistema"
}
```

### 4. Alerta desde Análisis de Línea Propia

**POST** `/api/agents/line/300/alert/analysis`

Body:
```json
{
  "destinationId": "dest_300_ida_centro",
  "tiempo_desviacion": 8.5,
  "tiempo_promedio": 32,
  "frecuencia_teorica": 10,
  "frecuencia_real": 12.5,
  "tasa_puntualidad": 78
}
```

Respuesta genera alerta de tipo `ALERTA_RETRASO` o `ALERTA_FRECUENCIA_BAJA`.

### 5. Alerta desde Detección de Competencia

**POST** `/api/agents/line/300/alert/competitor`

Body:
```json
{
  "competitorId": "CUTCSA_50",
  "tipo_evento": "adelantado",
  "recorrido": "8 de Octubre",
  "sentido": "ida",
  "tiempo_ventaja": 7,
  "unidades_detectadas": 1,
  "distancia_metros": 450
}
```

Respuesta:
```json
{
  "alerta_id": "ALERTA_RIVAL_300_1680123456789",
  "linea": 300,
  "tipo": "ALERTA_RIVAL_ADELANTADO",
  "recorrido": "8 de Octubre",
  "sentido": "ida",
  "tiempo_minutos": 7,
  "competidor": {
    "nombre": "Línea 50 CUTCSA",
    "empresa": "CUTCSA"
  },
  "acciones_recomendadas": [
    "Inyectar servicio directo en próxima terminal",
    "Aumentar velocidad comercial en corredor",
    "Notificar a planchistas de oportunidad de pasajeros"
  ],
  "severidad": "MEDIA"
}
```

### 6. Historial de Alertas

**GET** `/api/agents/alerts/history?lineId=300&tipo=ALERTA_RETRASO&sentido=ida`

Query params:
- `lineId` — filtrar por línea
- `tipo` — filtrar por tipo de alerta
- `sentido` — filtrar por sentido (ida/vuelta)
- `horaInicio` — filtrar desde timestamp ISO

### 7. Estadísticas de Alertas

**GET** `/api/agents/alerts/statistics`

Respuesta:
```json
{
  "timestamp": "2026-04-06T14:30:00Z",
  "statistics": {
    "300": {
      "total": 15,
      "por_tipo": {
        "ALERTA_RETRASO": 8,
        "ALERTA_RIVAL_ADELANTADO": 5,
        "ALERTA_FRECUENCIA_BAJA": 2
      },
      "por_sentido": {
        "ida": 10,
        "vuelta": 5
      }
    }
  }
}
```

---

## 🧪 Testing Rápido

### Con curl:

```bash
# 1. Ver estado general
curl http://localhost:3099/api/agents/status

# 2. Ver estado de línea 300
curl http://localhost:3099/api/agents/line/300/status

# 3. Generar una alerta
curl -X POST http://localhost:3099/api/agents/line/300/alert \
  -H "Content-Type: application/json" \
  -d '{
    "tipo": "ALERTA_RETRASO",
    "recorrido": "Centro - Ida",
    "sentido": "ida",
    "tiempo_minutos": 5,
    "mensaje": "Test alert",
    "acciones": ["Test action"]
  }'

# 4. Ver historial
curl http://localhost:3099/api/agents/alerts/history?lineId=300

# 5. Ver estadísticas
curl http://localhost:3099/api/agents/alerts/statistics
```

### Con Node.js/JavaScript:

```javascript
const fetch = require('node-fetch');

async function testAgents() {
  // Ver status
  const status = await fetch('http://localhost:3099/api/agents/status').then(r => r.json());
  console.log('Status:', status);

  // Generar alerta
  const alert = await fetch('http://localhost:3099/api/agents/line/300/alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tipo: 'ALERTA_RETRASO',
      recorrido: 'Centro - Ida',
      sentido: 'ida',
      tiempo_minutos: 6,
      mensaje: 'Prueba de alerta',
      acciones: ['Acción 1', 'Acción 2']
    })
  }).then(r => r.json());
  console.log('Alert generated:', alert);
}

testAgents().catch(console.error);
```

---

## 🎯 Características Clave

### ✅ Ventajas

1. **Sin Preguntas** — Los agentes se crean automáticamente desde `lineas-config.json`
2. **Escalable** — Agregar una línea solo requiere actualizar el JSON
3. **Alertas Estructuradas** — Formato consistente: recorrido, sentido, tiempo, acciones
4. **Aislamiento de Datos** — Datos de competencia nunca contaminan métricas propias
5. **REST APIs** — Fácil de integrar con frontend React

### 🔒 Restricciones

- **Datos públicos solo** — Sin scraping invasivo, solo `montevideo.gub.uy`
- **Cero datos inventados** — Todo viene de APIs reales o falla explícitamente
- **Independencia de servicios cargados** — Agentes no dependen de "cartones" o servicios incompletos

---

## 📝 Agregar Nueva Línea

Para agregar una nueva línea (ej: Línea 330):

1. Editar `backend/config/lineas-config.json`:

```json
{
  "id": 330,
  "nombre": "Línea 330",
  "empresa": "UCOT",
  "orquestador_puerto": 3103,
  "destinos": [...],
  "competidores": [...],
  "horarios_tipos": ["Hábiles", "Sábados", "Domingos"],
  "datos_publicos": {...}
}
```

2. Reiniciar bridge-server:

```bash
npm run dev
```

3. Verificar:

```bash
curl http://localhost:3099/api/agents/status
```

---

## 🐛 Debugging

### Logs de inicialización

```javascript
// En MasterOrchestrator.initialize()
console.log(`✅ Línea ${id}: ${totalAgents} agentes creados`);
```

### Historial de alertas para debugging

```bash
curl http://localhost:3099/api/agents/alerts/history?lineId=300
```

### Limpiar historial (si es necesario)

```bash
curl -X DELETE http://localhost:3099/api/agents/alerts/history
```

---

## 📞 Próximos Pasos

1. **Frontend**: Consumir `/api/agents/*/alert` desde componentes React
2. **Datos públicos**: Integrar scraping de GPS real y horarios STM en analizadores
3. **Notificaciones**: Push de alertas a planchistas/operadores
4. **Persistencia**: Guardar alertas en Firestore para análisis histórico
