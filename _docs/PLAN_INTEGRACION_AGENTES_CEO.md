# 🎯 PLAN DE INTEGRACIÓN OPERATIVA — CEO

**Documento Confidencial**
**Fecha**: 6 de abril de 2026
**De**: CEO UCOT
**Para**: Equipo técnico

---

## SITUACIÓN ACTUAL

✅ **YA EXISTE:**
- Frontend con ExecutiveDashboard completo
- Componentes de alertas, KPIs, recomendaciones
- Hook useDashboardData que consume datos del backend
- Sistema de agentes multisensor (39 agentes creados)

❌ **FALTA:**
- Conectar sistema de agentes con el dashboard existente
- Los agentes generen alertas que aparezcan en el dashboard
- Las decisiones del CEO se reflejen en acciones operativas

---

## ESTRATEGIA: NO CREAR, INTEGRAR

### Paso 1: Conectar APIs de Agentes con Backend Existente

**Archivos a modificar:**
- `backend/bridge-server.js`
  - Agregar líneas: importar MasterOrchestrator
  - Agregar línea: `app.use('/api/agents', agentsRoutes);`
  - Inicializar orquestador en startup

**Resultado:**
- ✅ Agentes enviando alertas a `/api/agents/line/{id}/alert`
- ✅ Dashboard puede consumir `/api/agents/status`
- ✅ Historial de alertas disponible en `/api/agents/alerts/history`

**Tiempo:** 15 minutos

---

### Paso 2: Modificar Hook useDashboardData para Consumir Agentes

**Archivo a modificar:**
- `frontend/src/hooks/useDashboardData.ts`

**Cambios necesarios:**
```typescript
// Agregar fetch a /api/agents/status
const agentStatus = await fetch('/api/agents/status');

// Agregar fetch a /api/agents/alerts/history
const alertas = await fetch(`/api/agents/alerts/history?lineId=${lineId}`);

// Combinar datos de agentes con datos existentes
return {
  ...datosExistentes,
  agentes: agentStatus,
  alertasAgentes: alertas
};
```

**Resultado:**
- ✅ Dashboard muestra alertas de agentes en tiempo real
- ✅ KPIs actualizan automáticamente
- ✅ RecomendacionesPanel muestra acciones de agentes

**Tiempo:** 20 minutos

---

### Paso 3: Crear Panel de Control para CEO

**Archivo a crear (pequeño):**
- `frontend/src/components/dashboard/CEOControlPanel.tsx`

**Funcionalidad:**
```
┌─ CEO Control Panel ────────────────────────────┐
│                                                 │
│ Línea 300 — Acción Inmediata                   │
│ ┌─ Inyectar 2 servicios directos              │
│ └─ [EJECUTAR] (envía POST a /api/agents/...)  │
│                                                 │
│ Línea 306 — Acción Estratégica                 │
│ ┌─ Expandir horarios nocturnos                │
│ └─ [EJECUTAR]                                  │
│                                                 │
│ Línea 316 — Petición Municipal                │
│ ┌─ Solicitar carril preferencial              │
│ └─ [EJECUTAR]                                  │
└─────────────────────────────────────────────────┘
```

**Resultado:**
- ✅ CEO ve alertas
- ✅ CEO ejecuta acciones tácticas directamente
- ✅ Acciones se registran en historial

**Tiempo:** 30 minutos

---

### Paso 4: Sincronizar Métricas en Tiempo Real

**Archivo a modificar:**
- `backend/bridge-server.js` (endpoint nuevo)

**Crear endpoint:**
```
GET /api/ceo/decision-status
```

**Retorna:**
```json
{
  "linea_300": {
    "accion": "inyectar 2 servicios directos",
    "estado": "ejecutada",
    "ingresos_incrementales": "$6,400",
    "duracion_estimada": "30 minutos"
  },
  "linea_306": {
    "accion": "expandir horarios nocturnos",
    "estado": "pendiente",
    "ingresos_estimados": "$12,000/mes"
  }
}
```

**Resultado:**
- ✅ CEO ve impacto de sus decisiones en tiempo real
- ✅ Métricas financieras actualizan automáticamente

**Tiempo:** 15 minutos

---

## RESUMEN DE INTEGRACIÓN

| Paso | Qué | Dónde | Tiempo | Resultado |
|------|-----|-------|--------|-----------|
| 1 | Conectar APIs | bridge-server.js | 15 min | Agentes operativos |
| 2 | Consumir datos | useDashboardData.ts | 20 min | Dashboard actualizado |
| 3 | Panel CEO | CEOControlPanel.tsx | 30 min | Control ejecutivo |
| 4 | Métricas en vivo | bridge-server.js | 15 min | Decisiones visibles |
| **TOTAL** | | | **80 minutos** | **Sistema Completo** |

---

## MIS DECISIONES COMO CEO (IMPLEMENTAR)

### Decisión 1: LÍNEA 300 — SERVICIO DIRECTO INMEDIATO ✅

**Acción:**
- Crear ruta 300D (Directa)
- 4 buses asignados
- Horarios: 06:30-09:00 (mañana), 17:00-20:00 (tarde)
- Tarifa: +30% premium

**Cómo implementar:**
```javascript
// En backend/scripts/crear-linea-300D.js
await orchestrator.requestAlert(300, {
  tipo: 'ACCION_EJECUTIVA',
  accion: 'CREAR_SERVICIO_DIRECTO',
  parametros: {
    buses: 4,
    tarifa_premium: 0.30,
    horarios: ['06:30-09:00', '17:00-20:00']
  }
});
```

**Métricas:**
- Ingresos: +$6,400/mes
- Inicio: Lunes 7 de abril

---

### Decisión 2: LÍNEA 306 — SERVICIO NOCTURNO ✅

**Acción:**
- Expandir últimos servicios hasta 02:00
- 2 buses dedicados

**Cómo implementar:**
```javascript
// En backend/scripts/expandir-linea-306.js
await orchestrator.requestAlert(306, {
  tipo: 'ACCION_EJECUTIVA',
  accion: 'EXPANDIR_HORARIOS',
  parametros: {
    nuevo_ultimo_servicio: '02:00',
    buses_asignados: 2
  }
});
```

**Métricas:**
- Ingresos: +$12,000/mes
- Inicio: Lunes 7 de abril

---

### Decisión 3: LÍNEA 316 — CARRIL PREFERENCIAL ✅

**Acción:**
- Petición formal a Intendencia
- Argumentación: datos de puntualidad vs CUTCSA
- Beneficio esperado: -5 minutos en Ruta 5

**Cómo implementar:**
```javascript
// En backend/scripts/peticion-carril-316.js
const alertas = await orchestrator.getAlertHistory({
  lineId: 316,
  tipo: 'ALERTA_RETRASO'
});

// Generar reporte para Intendencia
const reporte = generarReporte(alertas);
// Enviar petición con datos
```

**Métricas:**
- Mejora OTP: +10 puntos porcentuales
- Ingresos: +$3,000/mes (por tarifa premium)
- Timeline: Petición semana 1, resolución mes 2

---

### Decisión 4: PROGRAMA DE LEALTAD ✅

**Acción:**
- Integración con tarjeta STM
- "Pasajeros UCOT": 10 pasajes = 1 gratis

**Cómo implementar:**
```javascript
// En backend/scripts/programa-lealtad.js
const programa = {
  nombre: 'UCOT Frecuente',
  mecanica: 'cada_10_pasajes_1_gratis',
  costo_operativo_porcentaje: -0.02,
  retencion_esperada_porcentaje: 0.12
};

// Integración con Firestore
await db.collection('loyalty_programs').add(programa);
```

**Métricas:**
- Costo: -2% ingresos
- Retención: +12% de clientes frecuentes
- ROI: 2.5 meses
- Inicio: 1 de mayo

---

## TIMELINE EJECUTIVO (PRÓXIMOS 7 DÍAS)

```
Lunes 7 abril — 09:00 AM
├─ Implementar paso 1: Conectar APIs
├─ Implementar paso 2: Hook useDashboardData
├─ Lanzar Línea 300D
└─ Lanzar Línea 306 nocturno

Lunes 7 abril — 02:00 PM
├─ Implementar paso 3: CEO Control Panel
├─ Primera prueba de decisiones ejecutivas
└─ Verificar métricas en tiempo real

Martes 8 abril
├─ Presentar petición carril preferencial a Intendencia
├─ Reunion con Junta Directiva
└─ Evaluar datos de primeras 24 horas

Viernes 11 abril
├─ Análisis: ingresos reales vs proyectados
├─ Ajustes operativos si es necesario
└─ Reportaje semanal al CEO
```

---

## MÉTRICAS A VIGILAR (Dashboard)

```json
{
  "ingresos_incrementales": {
    "300D": "$6,400/mes",
    "306_nocturno": "$12,000/mes",
    "tarifa_premium": "$3,000/mes",
    "total_mes_1": "+$21,400"
  },
  "operacional": {
    "OTP_promedio": "72% → 80% (meta)",
    "frecuencia_real_linea_300": "12.5 → 10.5 min",
    "frecuencia_real_linea_306": "15.5 → 13.5 min",
    "retención_clientes": "+12% (programa lealtad)"
  },
  "competencia": {
    "cuota_300_vs_cutcsa_103": "30% → 45%",
    "penetración_mercado_ucot": "8.84% → 10%",
    "pasajeros_nocturnos_306": "0 → 200/noche"
  }
}
```

---

## RIESGOS Y MITIGACIÓN

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|--------|-----------|
| API falla durante integración | Media | Alta | Rollback en 15 min |
| Sistema de agentes genera alertas falsas | Baja | Media | Validación manual primeros 3 días |
| CUTCSA responde agresivamente | Alta | Alta | Tener plan B (ruta alternativa) |
| Intendencia rechaza carril preferencial | Media | Media | Solicitar multa en segundo plazo |
| Ingresos reales < proyectados 20% | Media | Baja | Ajustar tarifa o frecuencia |

---

## APROBACIONES REQUERIDAS

- [ ] CEO: Aprobar decisiones de integración
- [ ] CTO: Implementar paso 1-4
- [ ] Jefe de Tránsito: Validar operativamente
- [ ] CFO: Validar proyecciones financieras

---

**Documento Clasificado: CONFIDENCIAL**
**Próxima revisión: 13 de abril de 2026**

*"No basta construir el sistema. Hay que usarlo. Ahora ejecutemos."*
