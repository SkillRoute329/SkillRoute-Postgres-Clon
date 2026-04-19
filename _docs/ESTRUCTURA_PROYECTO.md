# ESTRUCTURA DEL PROYECTO TransformaFacil 2.0

## 📁 Árbol Completo de Directorios

```
transformafacil-2.0/
│
├── 📄 README.md (descripción general)
├── 📄 RESUMEN_PROYECTO_SEMANAS_1_9.md (este documento)
├── 📄 SEMANA_89_DASHBOARD_EJECUTIVO.md (detalles Semana 8-9)
├── 📄 DASHBOARD_SETUP.md (guía de uso)
├── 📄 ESTRUCTURA_PROYECTO.md
│
│
├── 🔧 BACKEND
│   ├── 📄 package.json
│   ├── 📄 tsconfig.json
│   ├── 🔗 .env (variables de entorno)
│   │
│   └── 📁 src/
│       │
│       ├── 📄 index.ts (servidor principal)
│       │
│       ├── 📁 config/
│       │   ├── constants.ts (configuración)
│       │   ├── database.ts (Firebase Firestore)
│       │   └── logger.ts (Winston)
│       │
│       ├── 📁 middleware/
│       │   ├── auth.ts (JWT + role validation)
│       │   ├── errorHandler.ts (error handling)
│       │   └── validation.ts (body validation)
│       │
│       ├── 📁 types/ (TypeScript interfaces)
│       │   ├── index.ts
│       │   ├── auth.ts (User, JWT)
│       │   ├── competition.ts (Semana 4)
│       │   ├── analytics.ts (Semana 5)
│       │   ├── forecast.ts (Semana 6-7)
│       │   └── dashboard.ts (Semana 8-9)
│       │
│       ├── 📁 services/ (Lógica de negocio)
│       │   ├── authService.ts
│       │   ├── competitionService.ts (600+ líneas, Semana 4)
│       │   ├── analyticsService.ts (600+ líneas, Semana 5)
│       │   ├── forecastService.ts (500+ líneas, Semana 6-7)
│       │   ├── dashboardService.ts (500+ líneas, Semana 8-9)
│       │   └── realtimeService.ts (Socket.io)
│       │
│       ├── 📁 controllers/ (Endpoints HTTP)
│       │   ├── authController.ts
│       │   ├── cartonController.ts
│       │   ├── fleetController.ts
│       │   ├── systemController.ts
│       │   ├── competitionController.ts (Semana 4)
│       │   ├── analyticsController.ts (Semana 5)
│       │   ├── forecastController.ts (Semana 6-7)
│       │   └── dashboardController.ts (Semana 8-9)
│       │
│       └── 📁 routes/ (Enrutamiento)
│           ├── index.ts (agregador principal)
│           ├── competition.routes.ts (Semana 4)
│           ├── analytics.routes.ts (Semana 5)
│           ├── forecast.routes.ts (Semana 6-7)
│           └── dashboard.routes.ts (Semana 8-9)
│
│
├── 🎨 FRONTEND
│   ├── 📄 package.json
│   ├── 📄 tsconfig.json
│   ├── 📄 tailwind.config.js
│   │
│   └── 📁 src/
│       │
│       ├── 📄 index.tsx (entrada)
│       ├── 📄 App.tsx (router principal)
│       │
│       ├── 📁 config/
│       │   └── api.ts (cliente HTTP)
│       │
│       ├── 📁 types/ (TypeScript interfaces)
│       │   ├── index.ts
│       │   ├── auth.ts
│       │   ├── competition.ts (Semana 4)
│       │   ├── analytics.ts (Semana 5)
│       │   ├── forecast.ts (Semana 6-7)
│       │   └── dashboard.ts (Semana 8-9)
│       │
│       ├── 📁 hooks/ (Custom React Hooks)
│       │   ├── useAuth.ts
│       │   ├── useCompetitionData.ts (Semana 4, 300+ líneas)
│       │   ├── useForecastData.ts (Semana 6-7, 300+ líneas)
│       │   └── useDashboardData.ts (Semana 8-9, 300+ líneas)
│       │
│       ├── 📁 components/
│       │   │
│       │   ├── 📁 auth/
│       │   │   ├── Login.tsx
│       │   │   └── ProtectedRoute.tsx
│       │   │
│       │   ├── 📁 competition/ (Semana 4)
│       │   │   ├── OverlapAnalysis.tsx
│       │   │   └── ConflictDetector.tsx
│       │   │
│       │   ├── 📁 analytics/ (Semana 5)
│       │   │   ├── CartoonValidator.tsx
│       │   │   └── LinesAtRiskPanel.tsx
│       │   │
│       │   ├── 📁 forecast/ (Semana 6-7)
│       │   │   ├── RevenuePredictor.tsx
│       │   │   ├── ScheduleSimulator.tsx
│       │   │   └── GrowthProjection.tsx
│       │   │
│       │   └── 📁 dashboard/ (Semana 8-9)
│       │       ├── ExecutiveDashboard.tsx (componente principal)
│       │       ├── KPICard.tsx
│       │       ├── SaludOperacionalCard.tsx
│       │       ├── LineasStatusPanel.tsx
│       │       ├── AlertasPanel.tsx
│       │       ├── RecomendacionesPanel.tsx
│       │       └── ProyeccionesChart.tsx
│       │
│       ├── 📁 pages/
│       │   ├── LoginPage.tsx
│       │   ├── DashboardPage.tsx
│       │   ├── CompetitionPage.tsx
│       │   ├── AnalyticsPage.tsx
│       │   ├── ForecastPage.tsx
│       │   └── NotFoundPage.tsx
│       │
│       └── 📁 styles/
│           ├── globals.css
│           └── index.css
│
│
└── 📦 DEPENDENCIAS PRINCIPALES

    Backend:
    ├── express (framework web)
    ├── firebase (autenticación + BD)
    ├── cors (cross-origin)
    ├── winston (logging)
    ├── socket.io (real-time)
    └── typescript

    Frontend:
    ├── react (UI)
    ├── typescript
    ├── tailwind (estilos)
    ├── lucide-react (iconos)
    ├── recharts (gráficos)
    └── axios (cliente HTTP)
```

---

## 🔄 FLUJO DE DATOS: Usuario → Frontend → Backend → DB

```
┌─────────────────────────────────────────────────────────────────────┐
│                    USUARIO (Navegador)                              │
│                   http://localhost:3001                             │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
        ┌──────────────────────────────────────┐
        │    React App (Frontend)              │
        │  ├─ ExecutiveDashboard.tsx           │
        │  ├─ useDashboardData Hook            │
        │  └─ Componentes UI                   │
        └────────────┬─────────────────────────┘
                     │
                     │ GET /api/dashboard/executive/:operador
                     │ Authorization: Bearer JWT_TOKEN
                     │
                     ▼
        ┌──────────────────────────────────────┐
        │  Express API Backend                 │
        │  http://localhost:3000               │
        │                                      │
        │  ├─ middleware (auth, validation)    │
        │  ├─ controllers (endpoints)          │
        │  └─ routes (/api/...)                │
        └────────────┬─────────────────────────┘
                     │
                     │ dashboardController.getExecutiveDashboard()
                     │
                     ▼
        ┌──────────────────────────────────────┐
        │  Services (Lógica de Negocio)        │
        │                                      │
        │  dashboardService                    │
        │  ├─ generarDashboardEjecutivo()      │
        │  ├─ obtenerEstadoLineas()            │
        │  ├─ calcularMetricas()               │
        │  └─ generarRecomendaciones()         │
        │                                      │
        │  + competitionService                │
        │  + analyticsService                  │
        │  + forecastService                   │
        │  (llamadas en paralelo)              │
        └────────────┬─────────────────────────┘
                     │
                     │ Promise.all([
                     │   competitionService.analizarCompetitividad(),
                     │   analyticsService.detectarCartonesMarginales(),
                     │   forecastService.calcularProyecciones()
                     │ ])
                     │
                     ▼
        ┌──────────────────────────────────────┐
        │  Firebase Firestore (BD)             │
        │                                      │
        │  Collections:                        │
        │  ├─ users/                           │
        │  ├─ lineas/                          │
        │  ├─ cartones/                        │
        │  ├─ boletaje/ (histórico)            │
        │  ├─ competencia/ (datos públicos)    │
        │  └─ recomendaciones/                 │
        │                                      │
        │  Query:                              │
        │  db.collection('lineas')             │
        │    .where('operador', '==', 'UCOT') │
        │    .get()                            │
        └────────────┬─────────────────────────┘
                     │
                     │ Datos filtrados por operador
                     │
                     ▼
        ┌──────────────────────────────────────┐
        │  Respuesta JSON                      │
        │  {                                   │
        │    success: true,                    │
        │    data: {                           │
        │      id: "dashboard-UCOT-...",       │
        │      operador: "UCOT",               │
        │      fecha: "2026-03-13T12:00:00Z",  │
        │      salud_operacional: {...},       │
        │      metricas: {...},                │
        │      lineas: [...],                  │
        │      recomendaciones: [...]          │
        │    }                                 │
        │  }                                   │
        └────────────┬─────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────────────┐
        │  Frontend Renderiza                  │
        │  ├─ KPICards (métricas)              │
        │  ├─ SaludOperacionalCard (score)     │
        │  ├─ LineasStatusPanel (estado)       │
        │  ├─ AlertasPanel (críticas)          │
        │  └─ RecomendacionesPanel (acciones)  │
        └──────────────────────────────────────┘

```

---

## 🎯 MAPEO DE FUNCIONALIDADES A ARCHIVOS

### 1. AUTENTICACIÓN
```
Frontend:  components/auth/Login.tsx
           hooks/useAuth.ts
Backend:   controllers/authController.ts
           services/authService.ts
           middleware/auth.ts
Database:  Firebase Auth
```

### 2. ANÁLISIS DE COMPETENCIA (Semana 4)
```
Frontend:  hooks/useCompetitionData.ts
           components/competition/OverlapAnalysis.tsx
           components/competition/ConflictDetector.tsx
Backend:   services/competitionService.ts (600+ líneas)
           controllers/competitionController.ts
           routes/competition.routes.ts
           types/competition.ts
Database:  lineas/, competencia/, recomendaciones/
```

### 3. VALIDACIÓN DE CARTONES (Semana 5)
```
Frontend:  components/analytics/CartoonValidator.tsx
           components/analytics/LinesAtRiskPanel.tsx
Backend:   services/analyticsService.ts (600+ líneas)
           controllers/analyticsController.ts
           routes/analytics.routes.ts
           types/analytics.ts
Database:  cartones/, boletaje/, lineas/
```

### 4. PRONÓSTICOS DE INGRESOS (Semana 6-7)
```
Frontend:  hooks/useForecastData.ts (300+ líneas)
           components/forecast/RevenuePredictor.tsx
           components/forecast/ScheduleSimulator.tsx
           components/forecast/GrowthProjection.tsx
Backend:   services/forecastService.ts (500+ líneas)
           controllers/forecastController.ts
           routes/forecast.routes.ts
           types/forecast.ts
Database:  boletaje/, demanda/, proyecciones/
```

### 5. DASHBOARD EJECUTIVO (Semana 8-9)
```
Frontend:  hooks/useDashboardData.ts (300+ líneas, 7 hooks)
           components/dashboard/ExecutiveDashboard.tsx (principal)
           components/dashboard/KPICard.tsx
           components/dashboard/SaludOperacionalCard.tsx
           components/dashboard/LineasStatusPanel.tsx
           components/dashboard/AlertasPanel.tsx
           components/dashboard/RecomendacionesPanel.tsx
           components/dashboard/ProyeccionesChart.tsx
Backend:   services/dashboardService.ts (500+ líneas)
           controllers/dashboardController.ts
           routes/dashboard.routes.ts
           types/dashboard.ts
Database:  Todas las colecciones (integrador)
```

---

## 📊 CAPAS ARQUITECTÓNICAS

### CAPA 1: Presentación (Frontend)
```
React Components
├─ Pages (vistas principales)
├─ Components (UI reutilizable)
├─ Hooks (lógica de estado)
└─ Types (TypeScript interfaces)
```

### CAPA 2: API (Backend Controllers)
```
Express Endpoints
├─ /api/auth/... (autenticación)
├─ /api/competition/... (competencia)
├─ /api/analytics/... (análisis)
├─ /api/forecast/... (pronósticos)
└─ /api/dashboard/... (dashboard ejecutivo)
```

### CAPA 3: Lógica de Negocio (Services)
```
TypeScript Services
├─ authService
├─ competitionService
├─ analyticsService
├─ forecastService
└─ dashboardService (orquestador)
```

### CAPA 4: Persistencia (Database)
```
Firebase Firestore
├─ users/ (usuarios)
├─ lineas/ (rutas)
├─ cartones/ (servicios)
├─ boletaje/ (histórico)
├─ competencia/ (datos públicos)
├─ demanda/ (zonas)
└─ recomendaciones/ (acciones)
```

---

## 🔒 SEGURIDAD: Validaciones en Cascada

```
Request HTTP
    ↓
1. Middleware CORS (permitir orígenes)
    ↓
2. Middleware verifyAuth (validar JWT)
    ↓
3. Middleware requireRole (validar rol)
    ↓
4. Controlador validateBody (validar datos)
    ↓
5. Servicio lógica de negocio
    ↓
6. Database query .where('operador', '==', operador)
    ↓
Respuesta (datos filtrados del operador)
```

---

## ⚡ PERFORMANCE: Optimizaciones

### 1. Parallelización (Promise.all)
```typescript
const [data1, data2, data3] = await Promise.all([
  service1.getData(),
  service2.getData(),
  service3.getData()
]); // En paralelo, no secuencial
```

### 2. Endpoints Granulares
```
/executive       → Dashboard completo (tarda 2-3s)
/metricas        → Solo KPIs (tarda <500ms)
/salud           → Solo score (tarda <200ms)
/proyecciones    → Solo gráficos (tarda <500ms)
```

### 3. Caching en Frontend
```typescript
useDashboardData({
  autoRefresh: true,
  refreshInterval: 300000 // 5 minutos
});
```

### 4. Lazy Loading de Componentes
```typescript
// Los tabs se renderizan solo cuando se activan
{selectedTab === 'overview' && <OverviewPanel />}
{selectedTab === 'lines' && <LineasPanel />}
```

---

## 🧪 TESTING (Ready pero no implementado)

### Unit Tests
```
backend/src/__tests__/
├─ services/
│  ├─ competitionService.test.ts
│  ├─ analyticsService.test.ts
│  ├─ forecastService.test.ts
│  └─ dashboardService.test.ts
├─ controllers/
│  └─ dashboardController.test.ts
└─ utils/
   └─ calculations.test.ts
```

### Integration Tests
```
backend/src/__tests__/integration/
├─ dashboard.integration.test.ts
├─ competition.integration.test.ts
└─ end-to-end.test.ts
```

### Frontend Tests
```
frontend/src/__tests__/
├─ hooks/
│  └─ useDashboardData.test.ts
├─ components/
│  ├─ ExecutiveDashboard.test.tsx
│  ├─ KPICard.test.tsx
│  └─ ProyeccionesChart.test.tsx
└─ integration/
   └─ dashboard.integration.test.tsx
```

---

## 📚 DOCUMENTACIÓN POR CARPETA

| Carpeta | Documentación |
|---------|-----------------|
| `/backend/src/services` | Docstrings en cada método |
| `/backend/src/controllers` | JSDoc en endpoints |
| `/backend/src/routes` | Comentarios de rutas |
| `/backend/src/types` | Interfaces documentadas |
| `/frontend/src/components` | Prop types JSDoc |
| `/frontend/src/hooks` | Hook descriptions |
| `/` (raíz) | README.md, RESUMEN, SETUP.md |

---

## 🚀 FLUJO DE DEPLOYMENT

```
┌─────────────────────────────────┐
│  Local Development              │
│  npm run dev (backend + frontend)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Staging                        │
│  Firebase Staging Project       │
│  Test all features              │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│  Production                     │
│  Firebase Firestore (prod)      │
│  Cloud Run (backend)            │
│  Firebase Hosting (frontend)    │
│  CDN (assets)                   │
│  Monitoring (Sentry + DataDog)  │
└─────────────────────────────────┘
```

---

## 📈 MÉTRICAS DE CÓDIGO

```
Backend:
  - 5 servicios principales
  - 8 controladores
  - 5 tipos de datos complejos
  - 40+ endpoints REST
  - 3,500+ líneas

Frontend:
  - 15+ componentes React
  - 7 custom hooks
  - 50+ interfaces TypeScript
  - 2,800+ líneas
```

---

## 🔄 CICLO DE ACTUALIZACIÓN

### Al Hacer Cambios en Backend:
1. Editar service (ej: `dashboardService.ts`)
2. Backend auto-reload con nodemon
3. API disponible inmediatamente
4. Frontend obtiene datos nuevos automáticamente

### Al Hacer Cambios en Frontend:
1. Editar componente (ej: `ExecutiveDashboard.tsx`)
2. Frontend auto-reload (Fast Refresh)
3. Estado preservado
4. Cambios visibles al instante

---

**Última actualización:** Marzo 13, 2026
**Versión:** 2.0.0-RC1
