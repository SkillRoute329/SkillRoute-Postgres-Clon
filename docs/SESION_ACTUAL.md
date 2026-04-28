# 🔁 SESIÓN ACTUAL — estado vivo del trabajo en curso

**Última actualización:** 2026-04-28 — FASE 1 COMPLETADA ✅ Deploy en producción

---

## ✅ FASE 1 COMPLETADA — "Demo-Ready para Inversores"

### Objetivo cumplido
Las 3 features core están al 100% funcional en producción. Verificación: **todos los módulos OK, 0 fallos**.

### Commits de esta sesión (en orden)
| Hash | Descripción |
|---|---|
| `53af9db4` | fix(auditoria): 11 bugs críticos + FCM + auth admin endpoints |
| `2ddadd3d` | docs(sesion): cierre sesión anterior |
| `c8049bd7` | feat(investor-ready): 3 features core al 100% |
| `fa1d7d78` | feat(pdf): exportación PDF reporte ejecutivo cross-operador |
| `8d97ced6` | fix(demo-path): 5 correcciones de navegación |

### Lo que quedó operativo

**Feature A — Inteligencia Cross-Operador ✅**
- Panel "Resumen Ejecutivo" como entrada por defecto en CorredoresHub
- 4 KPIs globales, Top 3 Amenazas, Top 3 Oportunidades desde 1850 pares DRO reales
- Distribución por rival con km y % ganados
- **Exportación PDF ejecutivo** con jsPDF (A4, marca SkillRoute, CONFIDENCIAL)
- Acceso: `/dashboard/traffic/corridor-intelligence`

**Feature B — Cumplimiento de Servicio ✅**
- Tab "Semana vs Semana": OTP semana actual vs anterior con delta ↑↓ por línea
- Tabla ordenada por peor línea primero
- 4 tabs: Diagnóstico, OTP, Ranking Coches, Semana vs Semana
- Acceso: `/dashboard/traffic/diagnostico-cumplimiento`

**Feature C — Incidencias con Push ✅**
- DriverAlertOverlay maneja tipo 'INCIDENCIA' con colores por prioridad
- Botón "VER INCIDENCIA" navega a `/dashboard/traffic/incidents`
- FCM trigger activo en Cloud Functions (dispara en onCreate)
- Acceso: `/dashboard/traffic/incidents`

**Demo path ✅**
- DashboardHome: 3 accesos rápidos a las features core (antes eran rutas legacy)
- Sidebar: "Inteligencia Cross-Op." (antes era "Análisis de Red")
- CEODashboardV7: links de puntualidad y cumplimiento corregidos

---

## 🎯 PRÓXIMO PASO — FASE 2: Revenue Validation

### Objetivo
Conseguir el primer contrato firmado con CUTCSA o UCOT (aunque sea piloto de 3 meses).

### Lo que necesita el producto para firmar

**2-A: Número de ROI concreto en el CEO Dashboard**
El directivo de CUTCSA necesita ver en la primera pantalla: "Con SkillRoute, reducís X inspectores en campo porque el sistema detecta desvíos automáticamente, ahorrando $Y/mes."
- Archivo: `CEODashboardV7.tsx` — agregar una tarjeta "Valor Estimado" con cálculo ROI basado en datos reales (incidencias detectadas × costo inspector × horas)

**2-B: Panel de administración para que el cliente configure sus propias alertas**
El cliente necesita poder configurar umbrales de alerta sin llamar a Jonathan.
- Existe: `AdminSetup.tsx` (admin/sistema)
- Falta: sección de "Configuración de Alertas" donde el admin pueda definir thresholds de OTP, bunching, etc.

**2-C: SLA documentado visible en la app**
- Una página `/dashboard/admin/sla` o modal que muestre: uptime garantizado, tiempo de respuesta de alertas, fuentes de datos y su frecuencia de actualización
- Genera confianza ante el directivo técnico de CUTCSA

**2-D: Acuerdo de privacidad de datos**
- Los datos de flota son sensibles. Necesita un texto visible en la app + modal de aceptación en primer login.

### Prioridad inmediata para Fase 2
```
Paso 1: Tarjeta ROI en CEODashboard (2-A) — mayor impacto en la decisión de compra
Paso 2: Configuración de alertas self-service (2-B) — reduce dependencia de Jonathan post-venta
Paso 3: SLA visible (2-C) — cierra objeción técnica del CTO de CUTCSA
```

---

## 🗂️ BACKLOG PRIORIZADO

1. **ROI card en CEO Dashboard** — "Valor estimado: $X/mes en inspectores ahorrados"
2. **Configuración de alertas self-service** — admin puede cambiar thresholds sin código
3. **SLA visible en app** — cierra objeción del CTO
4. **Deploy índice Firestore** — ya deployado ✅ (se hizo con `firebase deploy --only firestore:indexes`)
5. **HRR v2 en vivo** — headway real sobre tramo compartido (backlog técnico)
6. **APK v1.2** — verificación FCM en dispositivo físico Android

---

## 🐛 BUGS CONOCIDOS NO CRÍTICOS

- **scheduleComplianceEngine**: alertas cada 6 horas (no en tiempo real). Documentado.
- **ShadowRadar speed fallback**: buses parados → velocidad 20 km/h → HRR falso en terminales. Conocido.
- **shapesAllOperators.json** 9.2MB excede límite SW cache 6MB → nunca se cachea. Conocido.
- **FCM tokens**: ningún usuario registró token aún → todas caen a `no_tokens_found`. Se resuelve con uso de la APK.

## 🔑 DECISIONES OPERATIVAS

- **Hub pattern**: hubs en `pages/traffic/`, `pages/fleet/`, `pages/admin/` con lazy+Suspense+tabs
- **PDF export**: usar jsPDF directamente (no html2canvas) para PDFs profesionales con texto seleccionable
- **requireAdmin middleware**: centralizado en `functions/src/api/authMiddleware.ts`
- **incidenciaDispatcher**: supervisores SIEMPRE; conductores solo si ALTA/CRITICA
- **normalizeEstado**: cualquier módulo nuevo que lea estado de vehículo debe usar este helper
- **authReady pattern**: para servicios Firestore en cold start → `await authReady` antes de queries
- **Socket.io deprecated**: no crear nuevos componentes que dependan de Socket.io
