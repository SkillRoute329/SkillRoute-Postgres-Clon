# SkillRoute — Proceso de Onboarding · 2-4 semanas

> Documento público y consumible. Diferenciador comercial vs Optibus
> (6-18 meses), Trapeze (6-18 meses), Swiftly (1-3 meses), Remix
> (días-semanas pero solo planning).
>
> **SkillRoute desde la firma del contrato hasta sistema operativo
> en producción: 2 a 4 semanas.**

---

## Por qué tan rápido

Tres razones estructurales:

**Una.** SkillRoute es **cloud-native multi-tenant**. No requiere
instalación on-premise, no requiere hardware nuevo, no requiere
servidores del operador. Todo corre en infra Firebase (Google
Cloud) gestionada por nosotros. Lo único que el operador instala
es la APK del driver app si quiere comunicación bidireccional con
conductores.

**Dos.** SkillRoute viene **pre-cargado con la red de transporte
metropolitano completo de Montevideo** (UCOT + CUTCSA + COME +
COETC, ~140 líneas, ~5.000 paradas, GTFS estándar). Para nuevos
operadores fuera de Montevideo, importamos su GTFS o lo
construimos en pocos días con sus datos básicos.

**Tres.** **Cross-operador es feature, no proyecto.** Otros
sistemas necesitan personalizar workflows por cada cliente.
SkillRoute usa el mismo modelo de datos para todos los operadores
de un sistema metropolitano — agregar un nuevo operador es
configuración, no desarrollo.

---

## Timeline detallado

### Semana 1 — Setup y configuración

| Día | Actividades del proveedor (SkillRoute) | Actividades del operador |
|---|---|---|
| 1-2 | Kickoff call. Entrega de credenciales admin. | Designa equipo: 1 admin, 1 operativo, 1 IT contact. |
| 3 | Setup de tenant del operador en Firestore. Configuración de RBAC inicial. | Provee logo, colores institucionales, nombres oficiales. |
| 4 | Importación de GTFS del operador (si tiene) o construcción inicial de catálogo de líneas y paradas. | Provee GTFS o lista de líneas + paradas en Excel. |
| 5 | Primera vista de la red en SkillRoute. Validación de datos importados con el operador. | Valida: están las líneas correctas, paradas correctas, geometrías correctas. |

**Hito semana 1:** sistema accesible vía URL personalizada
(`empresa.skillroute.uy`), datos de líneas y paradas correctos,
admins con acceso.

### Semana 2 — Datos operativos y conectividad

| Día | Actividades del proveedor | Actividades del operador |
|---|---|---|
| 1-2 | Configuración del feed GPS. Si el operador usa STM API (Montevideo), conexión inmediata. Si tiene CAD/AVL propio, integración por API. | Provee credenciales o endpoint de su feed GPS si aplica. Confirmación de horarios oficiales del organismo regulador. |
| 3 | Importación de horarios oficiales (STM/regulador local) y vinculación con líneas. | Confirma horarios. |
| 4 | Setup de personal: importación masiva desde Excel del operador (conductores, inspectores, mecánicos). Configuración de roles. | Provee Excel con personal + roles. |
| 5 | Setup de la flota: vehículos, asignación a líneas, datos básicos. | Provee Excel con flota o lista de vehículos. |

**Hito semana 2:** sistema con datos operativos reales del operador
funcionando en producción. Buses se ven en el mapa en tiempo real.

### Semana 3 — Capacitación y módulos avanzados

| Día | Actividades del proveedor | Actividades del operador |
|---|---|---|
| 1 | Capacitación al equipo de operaciones: NavigationModule, ListeroModule, TerminalListero, DistribucionDiaria, BoletinInspeccion. | Equipo de tráfico participa de capacitación. |
| 2 | Capacitación al equipo de flota: FleetMonitor, MaintenanceDashboard, VehicleList. | Equipo mantenimiento participa. |
| 3 | Capacitación al equipo de RRHH: PersonalUcot, RotationMatrix, AdminTurnos. | Equipo RRHH participa. |
| 4 | Capacitación al equipo directivo: CEODashboard V7, OTPDashboard, MarketPenetration, ShadowRadar. | Directivos participan. |
| 5 | Capacitación al equipo regulatorio (si aplica): Compliance reporting, dossier exportable. | Equipo legal/regulatorio participa. |

**Hito semana 3:** equipos del operador capacitados y usando el
sistema en operativa diaria.

### Semana 4 — Refinamiento y go-live formal

| Día | Actividades del proveedor | Actividades del operador |
|---|---|---|
| 1-2 | Refinamiento basado en feedback de la semana 3. Ajuste de thresholds OTP, reglas de turnos, alertas. | Operador reporta lo que no funcionó como esperaba. |
| 3 | Configuración de cron jobs: refresh competidores, snapshots OTP, market penetration diaria. | — |
| 4 | Configuración de notificaciones FCM para conductores (driver app). Distribución de APK. | Conductores instalan APK. |
| 5 | Go-live formal. Reunión de cierre de onboarding. Handoff a soporte continuo. | Equipo del operador firma acta de aceptación. |

**Hito semana 4:** sistema 100% operativo, equipos trabajando
autónomamente, soporte de SkillRoute pasa de implementación a
mantenimiento continuo.

---

## Operadores con onboarding más rápido (2-3 semanas)

Si el operador cumple estos prerequisitos, el onboarding se acorta a
2-3 semanas:

- ✅ GTFS-Static disponible y vigente.
- ✅ CAD/AVL existente con API de salida.
- ✅ Personal y flota disponibles en Excel estructurado.
- ✅ Equipo asignado a la implementación con dedicación >50%.
- ✅ Política RBAC clara (quién puede qué).

---

## Operadores con onboarding extendido (4-6 semanas)

Cuando alguno de estos casos aplica, el onboarding puede extenderse
a 4-6 semanas:

- ⚠️ No tiene GTFS-Static (lo construimos desde cero con datos
  básicos).
- ⚠️ No tiene CAD/AVL (proveemos APK de driver-grade que reporta GPS
  en lugar del bus).
- ⚠️ Datos de personal/flota dispersos o sin estructurar.
- ⚠️ Múltiples bases de datos legacy a integrar.
- ⚠️ Requerimientos regulatorios locales no estándar (adaptación de
  Equity Latam Engine).
- ⚠️ Equipo del operador con dedicación <30%.

Aún así, **6 semanas máximo** para cualquier configuración estándar
es nuestro compromiso.

---

## Caso UCOT — Evidencia documentada

UCOT es nuestra primera implementación. Operador real con 70 buses
operando en el sistema metropolitano de Montevideo.

| Hito | Fecha | Resultado |
|---|---|---|
| Kickoff inicial | (Implementación piloto) | OK |
| Importación de GTFS UCOT | Semana 1 | 70 líneas operativas + ~2000 paradas |
| Conexión a STM (GPS público IMM) | Semana 1-2 | Feed en vivo, ~70-300 buses visibles |
| Datos operativos cargados | Semana 2 | Personal + cartones + boletines + flota |
| Capacitación a equipo UCOT | Semana 3 | Tráfico, RRHH, mantenimiento, dirección |
| Go-live | Semana 4 | Sistema en operativa diaria |

Resultado actual (abril 2026): UCOT usa SkillRoute en producción
para todas sus operaciones diarias — gestión de cartones, listero,
inspecciones, monitoreo de flota, ShadowRadar cross-operador, KPIs
ejecutivos. **Sin pago de licencia inicial: piloto técnico.**

---

## Comparativa con líderes mundiales

| Plataforma | Tiempo típico de onboarding | Fuente |
|---|---|---|
| **SkillRoute** | **2-4 semanas** | Documentación pública |
| Remix (Via) | Días a 2 semanas (solo planning, no operations) | G2 reviews |
| Swiftly | 1-3 meses | Public deployments |
| Optibus | 6-12 meses (operadores grandes) | Industry standard |
| Trapeze | 6-18 meses + consultoría | WMATA Inspector General report |

**SkillRoute es la única plataforma end-to-end (planning +
scheduling + operations + real-time + analytics) que entrega en
4 semanas.**

---

## Compromisos del proveedor (SkillRoute)

- Disponibilidad de implementación team durante las 4 semanas.
- Soporte 24/7 durante go-live (semana 4).
- Documentación completa en español.
- Capacitación grabada (videos accesibles permanentemente).
- Acceso a roadmap público para visibilidad de futuras features.
- SLA post-go-live: uptime 99.95%, latencia GTFS-RT < 5s.

---

## Compromisos del operador

- Equipo asignado con dedicación >50% durante las 4 semanas.
- Datos básicos disponibles (personal, flota, líneas, paradas).
- Decisión rápida en validaciones (sin bloqueos administrativos
  internos > 24h).
- Apertura para capacitación (presencial o virtual).
- Feedback constructivo durante refinamiento.

---

## Métricas de éxito del onboarding

Al cierre de las 4 semanas, las siguientes métricas deben estar en
verde:

- ✅ Sistema accesible vía URL del operador.
- ✅ Datos de líneas y paradas validados.
- ✅ GPS feed activo y mostrando buses en el mapa.
- ✅ Personal y flota cargados.
- ✅ Equipos capacitados (mínimo 1 sesión por departamento).
- ✅ Cron jobs configurados (refresh competidores, OTP, market
  penetration).
- ✅ APK driver app distribuida.
- ✅ Acta de aceptación firmada.
- ✅ Documentación handoff entregada.
- ✅ Soporte continuo activo.

---

## ¿Cómo arrancar?

Si tu operador quiere evaluar SkillRoute, el primer paso es una
**reunión de descubrimiento de 60 minutos**. Vemos juntos:

- Tu situación actual (operador, flota, sistema vigente).
- Tus prioridades (OTP, gestión de personal, compliance, market
  intelligence).
- Encaje con SkillRoute (sí, no, parcial).
- Plan tentativo de onboarding ajustado a tu realidad.
- Propuesta económica y comercial.

Sin compromiso. Sin SOW. Sin lock-in.

**Contacto:** jonathanlaluz@gmail.com (en SkillRoute estamos en
estructura comercial liviana — la respuesta directa del fundador es
parte de la propuesta de valor).
