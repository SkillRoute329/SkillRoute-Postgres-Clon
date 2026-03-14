# SEMANA 10-11: INTEGRACIÓN STM + 5G
## Datos Públicos y Máquinas Dispensadoras 5G en Tiempo Real

---

## 📋 RESUMEN

**Objetivo:** Integrar datos públicos de STM Uruguay con máquinas dispensadoras 5G para proporcionar visibilidad completa de cambios de horarios competitivos y datos de boletaje en tiempo real.

**Valor agregado:**
- ✅ Alertas automáticas cuando competidores avanzan horarios
- ✅ Datos de boletaje real desde máquinas 5G
- ✅ Conteo de pasajeros en tiempo real
- ✅ Integración con dashboard ejecutivo
- ✅ Monitoreo de calidad de datos

---

## 🏗️ ARQUITECTURA IMPLEMENTADA

### Backend (500+ líneas nuevas)

#### 1. **Tipos STM** (`backend/src/types/stm.ts`)
```typescript
// Datos públicos STM
- LineaSTM (número, operador, color, paradas, horarios)
- HorarioSTM (viajes, vigencia, versión)
- ViajeSTM (horarios de salida/llegada, días de semana)

// Máquinas 5G
- Maquina5G (ID, estado, batería, conectividad)
- DatosBoletaje5G (transacciones en tiempo real)
- ConteoPassajeros5G (ocupación en vivo)

// Alertas y cambios
- CambioHorarioDetectado (tipo, severidad, impacto)
- AlertaEnVivoCompetencia (urgencia, acción)
- DatosEnVivoBus (GPS, pasajeros, cumplimiento)

// Métricas
- EstadisticasDiariasBus (ingresos, cumplimiento)
- CalidadDatos (sincronización, máquinas activas)
```

#### 2. **Servicio STM** (`backend/src/services/stmService.ts` - 600+ líneas)

**Métodos principales:**
```typescript
obtenerLineasSTM()              // Obtiene todas las líneas públicas
obtenerHorariosLinea()          // Horarios vigentes de una línea
sincronizarHorarios()           // Sincroniza con BD local
detectarCambiosHorarios()       // Detecta adelantos/atrasos
registrarBoletaje5G()           // Registra transacciones
actualizarConteoPassajeros()    // Actualiza ocupación en vivo
obtenerDatosEnVivoBus()         // Datos GPS y estado
generarAlertaCompetencia()      // Crea alertas automáticas
obtenerEstadisticasDiasBus()    // Estadísticas consolidadas
calcularCalidadDatos()          // Monitorea calidad STM
```

**Detección de Cambios:**
- Compara horarios vigentes vs históricos
- Identifica adelantos/atrasos/cancelaciones
- Calcula diferencia en minutos
- Determina severidad (baja/media/alta)
- Estima impacto en pasajeros

#### 3. **Controlador** (`backend/src/controllers/stmController.ts`)

**8 Endpoints REST:**
```
GET    /api/stm/lineas                    (líneas públicas)
GET    /api/stm/horarios/:numeroLinea     (horarios vigentes)
POST   /api/stm/sincronizar               (trigger sincronización)
GET    /api/stm/cambios/:numeroLinea      (cambios detectados)
POST   /api/stm/boletaje-5g               (registrar transacciones)
POST   /api/stm/ocupacion-realtime        (conteo pasajeros)
GET    /api/stm/bus-en-vivo/:busId        (datos en vivo)
GET    /api/stm/calidad-datos             (calidad STM)
```

#### 4. **Rutas** (`backend/src/routes/stm.routes.ts`)
- Protegidas con JWT
- Endpoints de lectura: todos los usuarios
- Endpoints de escritura: admin/system
- Sincronización: admin only

### Frontend (400+ líneas nuevas)

#### 1. **Hooks** (`frontend/src/hooks/useSTMData.ts`)
```typescript
useSTMLineas()                  // Obtiene todas las líneas
useHorarios(numeroLinea)        // Obtiene horarios de una línea
useCambiosHorarios(numeroLinea) // Detecta cambios
useBusEnVivo(busId)             // Datos en vivo del bus (auto-refresh)
useCalidadDatos()               // Calidad de sincronización STM
useSincronizacionSTM()          // Dispara sincronización manual
```

#### 2. **Tipos** (`frontend/src/types/stm.ts`)
Espejo completo de tipos backend para type-safety.

#### 3. **Componentes** (`frontend/src/components/stm/`)

**STMMonitor.tsx** - Componente principal
- Resumen de calidad STM (máquinas, sincronización, latencia)
- Grid de líneas con información básica
- Detalles expandibles de líneas seleccionadas
- Listado de cambios detectados

**Subcomponentes:**
- `LineaCard` - Tarjeta interactiva de línea
- `LineaDetalles` - Detalles con cambios detectados
- `CambioCard` - Tarjeta de cambio individual

---

## 🔄 FLUJO DE INTEGRACIÓN CON DASHBOARD

```
STM Cambio detectado
    ↓
STMService.detectarCambiosHorarios()
    ↓
stmService.generarAlertaCompetencia()
    ↓
AlertaEnVivoCompetencia guardada en Firestore
    ↓
DashboardService obtiene alertas
    ↓
ExecutiveDashboard muestra en tab Alertas
    ↓
Usuario ve: "Línea 3 (competidor) adelantó 15 min"
    ↓
Dashboard recomienda: "Ejecuta simulador de horarios"
```

---

## 📊 DATOS PÚBLICOS STM

### Líneas Monitoreadas
- COETC (ej: líneas 1-99)
- COME (ej: líneas 100-199)
- Cutcsa (ej: líneas 200-299)
- UCOT (ej: líneas 300-399)
- Otros operadores

### Información Pública
- Número de línea
- Operador responsable
- Paradas (nombre, coordenadas GPS)
- Horarios vigentes (desde/hasta)
- Frecuencia de servicios
- Duración estimada
- Color de línea para identificación

### Actualización de Datos
- STM publica cambios cada lunes-viernes
- Sincronización automática diaria
- Historial de cambios por 6 meses
- Detección automática de diferencias

---

## 5G MACHINES INTEGRATION

### Máquinas Dispensadoras
Ubicadas en todos los buses:
- Modelo: Sistema 5G STM v2.0
- Funciones:
  - Venta de boletaje
  - Aceptación de SUBE
  - Validación de pasajeros especiales
  - Reporte de ocupación

### Datos Capturados
```
Por cada transacción:
├─ Fecha/hora exacta
├─ Tipo de tarifa (adulto, jubilado, estudiante)
├─ Monto (56 pesos típico)
├─ Método (efectivo, SUBE, código QR)
├─ Parada de descenso
└─ Cumplimiento (¿pagó?)

En tiempo real:
├─ Pasajeros a bordo (sensor)
├─ % Ocupación del bus
├─ Temperatura del motor
├─ Batería de máquina
└─ Conectividad (5G/4G/3G)
```

### Sincronización
- Enviado cada vez que hay conexión
- Buffer local si sin conexión
- Prioridad: SUBE > efectivo > otro
- Latencia típica: <500ms

---

## ⚠️ ALERTAS COMPETITIVAS EN TIEMPO REAL

### Tipos de Alertas Generadas

1. **Adelanto Detectado** (Severidad: ALTA)
   - Competidor adelantó horario >15 min
   - Estimación de pasajeros en riesgo
   - Recomendación: Ejecutar simulador

2. **Sincronización Horaria** (Severidad: MEDIA)
   - Competidor ajustó horarios de coincidencia
   - Efecto: Saca pasajeros en horas pico
   - Recomendación: Monitorear paradas clave

3. **Frecuencia Aumentada** (Severidad: MEDIA)
   - Competidor agregó más viajes/día
   - Impacto: Menor diferencia de tiempo
   - Recomendación: Aumentar frecuencia también

4. **Nueva Parada Agregada** (Severidad: BAJA)
   - Competidor agregó parada intermedia
   - Efecto: Mayor cobertura geográfica
   - Recomendación: Evaluar agregar parada

---

## 📈 CALIDAD DE DATOS

### Indicadores Monitoreados
```
Máquinas Activas:      # de máquinas operativas
Sincronización:        % de transacciones sincronizadas
Latencia Promedio:     Tiempo API <500ms = excelente
Disponibilidad API:    STM uptime 99%+
Calidad General:
  - Excelente: >95% sincronización
  - Buena:     85-95%
  - Regular:   70-85%
  - Mala:      <70%
```

### Dashboard STM
- Visible en Executive Dashboard
- Actualización diaria
- Alertas si cae por debajo de umbrales
- Historial de 6 meses

---

## 🔐 SEGURIDAD E INTEGRACIÓN

### Autenticación
- JWT requerida para sincronización manual
- Endpoint de lectura: todos los usuarios
- Endpoint de escritura: admin/system roles

### Protección de Datos
- Transacciones guardadas sin PII
- Agregación por línea/operador
- Auditoría de sincronizaciones
- Cumplimiento de privacidad

### Aislamiento Multi-tenant
- Cada operador ve solo sus competidores
- No acceso a datos internos de otros
- Agregaciones públicas solamente

---

## 📚 ARCHIVOS CREADOS (10 nuevos)

**Backend:**
1. `backend/src/types/stm.ts` (300+ líneas)
2. `backend/src/services/stmService.ts` (600+ líneas)
3. `backend/src/controllers/stmController.ts` (250+ líneas)
4. `backend/src/routes/stm.routes.ts` (100+ líneas)
5. `backend/src/routes/index.ts` (ACTUALIZADO)

**Frontend:**
6. `frontend/src/types/stm.ts` (200+ líneas)
7. `frontend/src/hooks/useSTMData.ts` (250+ líneas)
8. `frontend/src/components/stm/STMMonitor.tsx` (400+ líneas)

**Documentación:**
9. `SEMANA_1011_STM_5G_INTEGRATION.md` (este archivo)

---

## 🚀 INTEGRATION CON DASHBOARD EJECUTIVO

### Flujo Automático
1. **Sincronización STM** (Diaria a las 00:30)
   - obtenerLineasSTM()
   - sincronizarHorarios()
   - detectarCambiosHorarios() para cada línea

2. **Detección de Cambios** (Real-time)
   - Comparar horarios vigentes vs históricos
   - Generar AlertaEnVivoCompetencia
   - Guardar en Firestore

3. **Dashboard actualiza** (Auto-refresh cada 5 min)
   - useDashboardData obtiene alertas críticas
   - Mostrar en tab Alertas
   - Incluir en recomendaciones ejecutivas

4. **Acción del usuario**
   - Click en alerta → ver detalles
   - Abrir ScheduleSimulator
   - Evaluar respuesta competitiva

---

## 💡 CASOS DE USO

### Caso 1: Detectar Adelanto de Competencia
```
09:15 - STM publica nuevo horario para línea 5
09:20 - syncSTM corre, detecta cambio
09:21 - AlertaEnVivoCompetencia creada
09:25 - Dashboard ejecutivo muestra alerta
09:30 - Manager ejecuta simulador, encuentra respuesta
10:00 - Implementa adelanto de 10 minutos
```

### Caso 2: Monitoreo de Ocupación en Vivo
```
Bus #1205 en línea 10
09:45 - Sensores detectan 95% ocupación
09:46 - ConteoPassajeros5G registrado
09:47 - Dashboard alerta al gerente
09:50 - Dispatcher envía bus extra a parada siguiente
```

### Caso 3: Análisis de Ingresos Reales
```
Transacciones de boletaje 5G llegan en tiempo real
├─ 09:00-10:00: 156 pasajeros adultos = $8,736
├─ Incluye pasajeros especiales (estudiantes, jubilados)
├─ SUBE transacciones sincronizadas 100%
└─ Monto actual coincide con proyecciones

Dashboard muestra:
- Ingresos reales vs proyectados: +2%
- Ocupación real vs estimada: -1%
```

---

## 🔄 PRÓXIMAS FASES (Semana 12)

### Testing
- [ ] Load test: 1,000+ máquinas 5G simultáneas
- [ ] Sincronización STM bajo carga
- [ ] Latencia API con múltiples operadores
- [ ] Failover y recuperación

### Deployment
- [ ] Firebase Firestore escalado
- [ ] Cloud Run para servicios STM
- [ ] Caché de Redis para STM lineas
- [ ] CDN para datos estáticos
- [ ] Monitoreo en producción (Sentry, DataDog)

### Documentación
- [ ] API STM documentada (OpenAPI)
- [ ] Manual de sincronización
- [ ] Guía de troubleshooting
- [ ] SLA de disponibilidad

---

## 📊 MÉTRICAS DE ÉXITO

| Métrica | Meta | Actual |
|---------|------|--------|
| Tiempo detección cambios | <2 min | N/A |
| % Sincronización boletaje | >95% | N/A |
| Latencia API STM | <500ms | N/A |
| Disponibilidad STM | 99%+ | N/A |
| Alertas accionables | >80% | N/A |

---

**Estado:** ✅ IMPLEMENTADO Y LISTO PARA TESTING

**Próximo paso:** Semana 12 - Production Testing & Deployment
