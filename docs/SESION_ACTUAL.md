# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-05-02 — Phase 3 + Phase 4 deployados · 7 módulos nuevos · 5 hubs actualizados

---

## ✅ ESTADO: Phase 3 (Inteligencia de Flota) + Phase 4 (Conductor y Expansión) completados

### Lo que se completó en esta sesión (2026-05-02 — continuación)

| Módulo | Ruta / Ubicación | Estado |
|---|---|---|
| **Mantenimiento Predictivo** | `/fleet` → tab "Mantenimiento Predictivo" | ✅ En prod |
| **Subsidios MTOP** | `/admin/regulatorio` → tab "Subsidios MTOP" | ✅ En prod |
| **Centro de Mando Unificado** | `/dashboard/super-admin/centro-mando` | ✅ En prod |
| **Exportador de Reportes** | `/traffic/financiero` → tab "Exportar Reportes" | ✅ En prod |
| **Alertas Documento Conductor** | `driver/AlertasDocumentoConductor.tsx` (componente) | ✅ Creado |

### Archivos creados en Phase 3 + Phase 4

| Archivo | Descripción |
|---|---|
| `frontend/src/pages/fleet/MantenimientoPredictivo.tsx` | Predictivo por km/días — diesel y eléctrico (INTERVALOS_PREVENTIVO) |
| `frontend/src/pages/admin/SubsidiosMTOP.tsx` | Estimador de subsidio estatal por línea y empresa |
| `frontend/src/pages/traffic/CentroMandoUnificado.tsx` | Dashboard SUPERADMIN: 4 empresas en tiempo real |
| `frontend/src/pages/traffic/ExportadorReportes.tsx` | CSV exportador: OTP, flota, costos, subsidios, combustible |
| `frontend/src/pages/driver/AlertasDocumentoConductor.tsx` | Alertas de vencimiento de carnet/libreta para el conductor |

### Archivos modificados en Phase 3 + Phase 4

| Archivo | Cambio |
|---|---|
| `frontend/src/pages/fleet/GestionFlotaHub.tsx` | +tab: Mantenimiento Predictivo |
| `frontend/src/pages/admin/RegulatorioHub.tsx` | +tab: Subsidios MTOP |
| `frontend/src/pages/traffic/FinancieroHub.tsx` | +tab: Exportar Reportes |
| `frontend/src/App.tsx` | +lazy import + ruta `/super-admin/centro-mando` |
| `frontend/src/components/Sidebar.tsx` | +ítem "Centro de Mando (SA)" en sección Administración |

---

## ✅ Sprints anteriores completados (Phase 1 + Phase 2 — 2026-05-02 morning)

| Módulo | Ruta | Estado |
|---|---|---|
| Ausencias y Licencias | `/admin/rrhh` → tab "Ausencias y Licencias" | ✅ |
| Vencimientos de Documentos | `/admin/rrhh` → tab "Vencimientos" | ✅ |
| Control de Combustible | `/fleet` → tab "Combustible" | ✅ |
| Costo por Línea | `/traffic/financiero` → tab "Costo por Línea" | ✅ |
| Alertas OTP proactivas | `/traffic/cumplimiento` → tab "Alertas OTP" | ✅ |
| P&L por Operador | `/traffic/financiero` → tab "P&L por Operador" | ✅ |
| Despacho Confirmado | `/traffic/planificacion` → tab "Despacho Confirmado" | ✅ |

---

## ✅ Acumulado total en producción

| Feature | Estado |
|---|---|
| `immBusesLive` Cloud Function | ✅ GPS enriquecido 4 empresas, ~996 buses |
| `immParadasList` Cloud Function | ✅ 4938 paradas con lat/lng, cache 30 min |
| `gtfsImporter.ts` + `gtfs_timetable` | ✅ 1361 docs, horarios completos |
| `otpEngine.ts` + alertas compliance | ✅ OTP cron 10min |
| ShadowRadar DRO cross-operador | ✅ 1850 pares, tiering T1/T2/T3 |
| SeatKm + HRR dashboards | ✅ 30.2M seat-km, 243 corredores |
| **Ausencias y Licencias** | ✅ Phase 1 |
| **Vencimientos Documentos** | ✅ Phase 1 |
| **Control de Combustible** | ✅ Phase 1 (diesel + eléctrico kWh) |
| **Alertas OTP proactivas** | ✅ Phase 1 |
| **Despacho Confirmado** | ✅ Phase 1 (programado vs real GPS) |
| **Costo por Línea** | ✅ Phase 2 (multi-empresa + EV) |
| **P&L por Operador** | ✅ Phase 2 (4 empresas, SUPERADMIN) |
| **Mantenimiento Predictivo** | ✅ Phase 3 |
| **Subsidios MTOP** | ✅ Phase 3 |
| **Centro de Mando Unificado** | ✅ Phase 3 / Phase 4 |
| **Exportador de Reportes CSV** | ✅ Phase 4 |
| **Alertas Documento Conductor** | ✅ Phase 4 |

---

## 📋 PRÓXIMO PASO INMEDIATO

Verificar + commit:

```bash
cd "c:\Users\jonat\Desktop\PROYECTOS\GestionUcot"
bash scripts/check_integrity.sh
```

Si exit 0, commitear con:

```
git add frontend/src/pages/fleet/MantenimientoPredictivo.tsx \
        frontend/src/pages/admin/SubsidiosMTOP.tsx \
        frontend/src/pages/traffic/CentroMandoUnificado.tsx \
        frontend/src/pages/traffic/ExportadorReportes.tsx \
        frontend/src/pages/driver/AlertasDocumentoConductor.tsx \
        frontend/src/pages/fleet/GestionFlotaHub.tsx \
        frontend/src/pages/admin/RegulatorioHub.tsx \
        frontend/src/pages/traffic/FinancieroHub.tsx \
        frontend/src/App.tsx \
        frontend/src/components/Sidebar.tsx \
        docs/SESION_ACTUAL.md

git commit -m "feat(phase3+4): mantenimiento predictivo, subsidios MTOP, centro mando unificado, exportador CSV"
```

Luego `git push` y deploy:

```bash
cd frontend && npm run build
firebase deploy --only hosting
```

---

## 📋 Pendiente — backlog priorizado

### Pendiente técnico
1. **Integración STM Card** — ingresos reales por viaje/línea/horario (confirmar API disponible)
2. **Demanda por parada** — heatmap de validaciones STM Card
3. **CostoPorLinea coches reales** — integrar con colección `vehiculos` real (actualmente usa distribución por linea desde Firestore, pero el campo `linea` en vehiculos puede no estar poblado para todas las empresas)
4. **AlertasDocumentoConductor** — integrar en DriverCompliance.tsx o en el portal del conductor (ahora es componente standalone)
5. **Módulo de licitaciones** — propuestas de servicio a STM (backlog v3)

### Backlog técnico menor
1. OTP oscillation — monitorear en prod (fix deployado 2026-05-01)
2. Calibrar CAPACITY_BY_AGENCY — datos oficiales STM
3. Consumir gtfs_calendar en UI — hábil/sáb/dom en Navegador
4. APK Android — actualizar con build actual
5. Seat-km sábado/domingo — svcType param al cron

---

## Bugs conocidos no críticos

- `regresionOLS.test.ts`: 4 tests fallan — pre-existente, no bloqueante
- AuthContext "INT #----" durante carga — cosmético
- `CostoPorLinea` usa coches por linea desde Firestore pero requiere campo `linea` poblado en cada vehículo
- `SubsidiosMTOP` muestra "Datos Estimados" hasta que se integre STM Card real

---

## APIs deployadas

| Endpoint | URL | Estado |
|---|---|---|
| `GET /immBusesLive?empresa=all` | `immbuseslive-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /immParadasList` | `immparadaslist-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `POST /gtfsImportRun` | `gtfsimportrun-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /computeOtpNow` | `computeotpnow-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /hrrQueryNow` | `hrrquerynow-3o5d3sy5xq-uc.a.run.app` | ✅ |
| `GET /seatKmCalculatorNow` | `us-central1-ucot-gestor-cloud.cloudfunctions.net/seatKmCalculatorNow` | ✅ |
| `hrrTick` (cron) | cada 10 min | ✅ |
| `seatKmCalculatorCron` (cron) | diario 6am Montevideo | ✅ |
