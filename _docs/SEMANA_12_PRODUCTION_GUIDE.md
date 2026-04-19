# SEMANA 12: PRODUCTION TESTING & DEPLOYMENT
## TransformaFacil 2.0 - Lanzamiento a Producción

---

## 📋 RESUMEN

**Objetivo:** Validar completamente el sistema bajo carga real, realizar deployment a producción y establecer monitoreo 24/7.

**Alcance:**
- ✅ Testing (unitarios, integración, carga, E2E)
- ✅ Deployment en Firebase + Cloud Run
- ✅ Configuración de monitoreo (Sentry, DataDog)
- ✅ Documentación final (API, manual de usuario)
- ✅ Plan de disaster recovery
- ✅ Capacitación de usuarios

---

## 🧪 TESTING PHASE

### 1. Testing Unitarios (Backend)

```bash
# Instalar herramientas
npm install --save-dev jest @types/jest ts-jest

# Crear tests para services
backend/src/__tests__/
├── services/
│   ├── competitionService.test.ts
│   ├── analyticsService.test.ts
│   ├── forecastService.test.ts
│   ├── dashboardService.test.ts
│   └── stmService.test.ts
└── utils/
    └── calculations.test.ts
```

**Ejemplo de test:**
```typescript
describe('competitionService', () => {
  it('debe detectar sobreposición >30%', async () => {
    const resultado = await competitionService.analizarSobreposicion('linea-3');
    expect(resultado.lineas_competidoras).toHaveLength(3);
    expect(resultado.sobreposicion_promedio).toBeGreaterThan(30);
  });

  it('debe calcular pasajeros en riesgo', async () => {
    const conflictos = await competitionService.detectarConflictosHorarios();
    expect(conflictos[0].pasajeros_en_riesgo).toBeGreaterThan(0);
  });
});
```

**Cobertura esperada:** >80% del código

### 2. Testing de Integración

```bash
backend/src/__tests__/integration/
├── dashboard.integration.test.ts (completo con todas las semanas)
├── stm.integration.test.ts (STM + alertas)
├── boletaje.integration.test.ts (5G + ingresos)
└── end-to-end.test.ts (flujo completo)
```

**Ejemplo:**
```typescript
describe('Dashboard Ejecutivo - E2E', () => {
  it('debe obtener dashboard completo en <3 segundos', async () => {
    const start = Date.now();
    const dashboard = await dashboardService.generarDashboardEjecutivo('UCOT');
    const duration = Date.now() - start;

    expect(dashboard).toBeDefined();
    expect(dashboard.metricas).toBeDefined();
    expect(dashboard.lineas).toHaveLength(>0);
    expect(duration).toBeLessThan(3000);
  });

  it('debe integrar datos de Semanas 4-11', async () => {
    const dashboard = await dashboardService.generarDashboardEjecutivo('UCOT');

    // Semana 4: Competencia
    expect(dashboard.resumen_competitivo).toBeDefined();

    // Semana 5: Analytics
    expect(dashboard.lineas[0].alertas).toBeDefined();

    // Semana 6-7: Forecast
    expect(dashboard.proyecciones).toHaveLength(3);

    // Semana 10-11: STM
    expect(dashboard.alertas_criticas).toBeDefined();
  });
});
```

### 3. Testing de Carga

```bash
# Instalar herramientas
npm install --save-dev k6 artillery

# Tests de carga con k6
backend/tests/load/
├── dashboard_load_test.js
├── stm_sync_load_test.js
└── concurrent_users_test.js
```

**Escenario 1: Dashboard concurrente**
```javascript
// 100 usuarios simultáneos obteniendo dashboard
export default function() {
  let response = http.get('http://localhost:3000/api/dashboard/executive/UCOT');
  check(response, {
    'status 200': r => r.status === 200,
    'latencia <2s': r => r.timings.duration < 2000,
  });
}

export let options = {
  stages: [
    { duration: '30s', target: 20 },   // Ramp up
    { duration: '1m30s', target: 100 }, // Hold
    { duration: '30s', target: 0 },     // Ramp down
  ],
};
```

**Escenario 2: STM sincronización**
```javascript
// 1,000 máquinas 5G enviando boletaje simultáneamente
export default function() {
  const payload = JSON.stringify({
    maquina_id: `machine-${__VU}`,
    bus_id: `bus-${__VU}`,
    operador: 'UCOT',
    linea_numero: 10,
    monto: 56,
    cumplimiento: true,
  });

  http.post('http://localhost:3000/api/stm/boletaje-5g', payload);
}

export let options = {
  vus: 1000,
  duration: '2m',
};
```

**Métricas esperadas:**
- Latencia p95 < 500ms
- Throughput > 10,000 req/sec
- Error rate < 0.1%
- CPU < 80%
- RAM < 4GB

### 4. Testing Funcional (Frontend)

```bash
npm install --save-dev @testing-library/react cypress

# Tests React
frontend/src/__tests__/
├── components/
│   ├── dashboard/ExecutiveDashboard.test.tsx
│   ├── dashboard/KPICard.test.tsx
│   └── stm/STMMonitor.test.tsx
└── hooks/
    ├── useDashboardData.test.ts
    └── useSTMData.test.ts
```

**Ejemplo:**
```typescript
describe('ExecutiveDashboard', () => {
  it('debe renderizar todos los KPIs', () => {
    render(<ExecutiveDashboard operador="UCOT" />);

    expect(screen.getByText(/Ingresos Totales/i)).toBeInTheDocument();
    expect(screen.getByText(/Pasajeros Totales/i)).toBeInTheDocument();
    expect(screen.getByText(/Ocupación Promedio/i)).toBeInTheDocument();
  });

  it('debe mostrar alertas críticas', () => {
    render(<ExecutiveDashboard operador="UCOT" />);

    const alertasTab = screen.getByRole('button', { name: /Alertas/i });
    fireEvent.click(alertasTab);

    expect(screen.getByText(/Línea en riesgo/i)).toBeInTheDocument();
  });
});
```

### 5. Testing E2E (Cypress)

```javascript
// cypress/e2e/dashboard.cy.js
describe('Dashboard Executive E2E', () => {
  beforeEach(() => {
    cy.login('manager1', 'password');
    cy.visit('http://localhost:3001/dashboard/UCOT');
  });

  it('debe cargar dashboard completo', () => {
    cy.get('[data-testid="dashboard-loading"]').should('not.exist');
    cy.get('[data-testid="kpi-ingresos"]').should('be.visible');
    cy.get('[data-testid="salud-card"]').should('be.visible');
  });

  it('debe detectar cambios STM en tiempo real', () => {
    cy.get('[data-testid="alerts-tab"]').click();
    cy.contains(/Cambio detectado/i).should('exist');
    cy.get('[data-testid="alert-adelanto"]').should('have.class', 'severidad-alta');
  });

  it('debe simular horarios correctamente', () => {
    cy.get('[data-testid="simulador-btn"]').click();
    cy.get('[data-testid="horario-input"]').type('07:30');
    cy.get('[data-testid="simular-btn"]').click();
    cy.contains(/Impacto estimado/i).should('be.visible');
  });
});
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Antes de Deployment

- [ ] Todos los tests pasan (>80% cobertura)
- [ ] No hay warnings en linter (eslint)
- [ ] Documentación actualizada
- [ ] Credenciales guardadas en Cloud Secret Manager
- [ ] Variables de entorno configuradas
- [ ] Backups de BD configurados
- [ ] Plan de rollback documentado

### Firebase Setup

```bash
# Instalar CLI
npm install -g firebase-tools

# Configurar proyecto
firebase login
firebase init

# Estructura Firebase
firebase.json
├── hosting (frontend)
├── functions (backend en Cloud Functions)
└── firestore.indexes.json (índices de BD)
```

**firestore.indexes.json:**
```json
{
  "indexes": [
    {
      "collectionGroup": "lineas",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "operador", "order": "ASCENDING" },
        { "fieldPath": "estado", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "stm_horarios",
      "queryScope": "Collection",
      "fields": [
        { "fieldPath": "operador", "order": "ASCENDING" },
        { "fieldPath": "fecha_vigencia_desde", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### Cloud Run Deployment

```bash
# Crear imagen Docker
cat > Dockerfile << 'EOF'
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
EOF

# Deploy
gcloud run deploy transformafacil-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "FIREBASE_PROJECT_ID=transformafacil-prod" \
  --memory 2Gi \
  --cpu 2 \
  --max-instances 100
```

### Firebase Hosting (Frontend)

```bash
# Build
cd frontend
npm run build

# Deploy
firebase deploy --only hosting

# Resultado
# ✓ Deploy complete!
# https://transformafacil-2-0.web.app
```

---

## 📊 MONITOREO EN PRODUCCIÓN

### Sentry (Error Tracking)

```typescript
// backend/src/config/sentry.ts
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({
      request: true,
      serverName: false,
      transaction: true,
    }),
  ],
});

// Usar en routes
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

**Alertas configuradas:**
- Error rate > 1%
- Latencia p95 > 1s
- Crashes no manejados
- Errores de API STM

### DataDog (APM)

```typescript
// backend/src/config/datadog.ts
import tracer from 'dd-trace';

tracer.init({
  service: 'transformafacil-backend',
  env: 'production',
  version: '2.0.0',
  hostname: 'transformafacil-backend',
});

// Instrumentar servicios
const dashboardTrace = tracer.trace('dashboardService.generarDashboard', async () => {
  // código aquí
});
```

**Dashboards creados:**
1. **System Health** (CPU, RAM, Disk, Network)
2. **API Performance** (Latencia, throughput, errores)
3. **STM Sync** (% sincronización, máquinas activas)
4. **Business Metrics** (Ingresos, pasajeros, líneas)
5. **User Activity** (Logins, acciones, reportes)

### Logs (Cloud Logging)

```typescript
// Logs estructurados
logger.info('Dashboard generado', {
  operador: 'UCOT',
  duracion_ms: 1250,
  lineas_procesadas: 22,
  alertas_criticas: 3,
});

logger.error('Error sincronizando STM', {
  error: err.message,
  codigo_error: err.code,
  timestamp: new Date(),
  severity: 'HIGH',
});
```

### Alerting

```yaml
# Terraform para alertas
resource "google_monitoring_alert_policy" "dashboard_latency" {
  display_name = "Dashboard latency > 2s"
  combiner     = "OR"

  conditions {
    display_name = "p95 latency"
    condition_threshold {
      filter          = "metric.type=custom.googleapis.com/dashboard_latency AND resource.type=cloud_run_revision"
      comparison      = "COMPARISON_GT"
      threshold_value = 2000
      duration        = "60s"
    }
  }

  notification_channels = [google_monitoring_notification_channel.slack.name]
}
```

---

## 📚 DOCUMENTACIÓN FINAL

### API Documentation (OpenAPI/Swagger)

```yaml
# swagger.yaml
openapi: 3.0.0
info:
  title: TransformaFacil 2.0 API
  version: 2.0.0
  description: Centro de Comando Unificado para Operadores de Transporte

servers:
  - url: https://api.transformafacil.com/v1
    description: Production

paths:
  /dashboard/executive/{operador}:
    get:
      summary: Obtener Dashboard Ejecutivo
      parameters:
        - name: operador
          in: path
          required: true
          schema:
            type: string
          example: UCOT
      security:
        - bearerAuth: []
      responses:
        '200':
          description: Dashboard obtenido exitosamente
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/DashboardEjecutivo'
        '403':
          description: No autorizado
```

**Generar documentación:**
```bash
# Instalar Swagger UI
npm install swagger-ui-express
npm install swagger-jsdoc

# Documentar endpoints
/**
 * @swagger
 * /api/dashboard/executive/{operador}:
 *   get:
 *     summary: Obtener dashboard ejecutivo
 */

# Generar
npm run docs
# http://localhost:3000/api-docs
```

### Manual de Usuario (PDF)

Crear con skill docx:
```
Secciones:
├── 1. Introducción (qué es, por qué es importante)
├── 2. Inicio de Sesión (credenciales, recuperación)
├── 3. Dashboard Ejecutivo
│   ├── KPIs Principales
│   ├── Salud Operacional
│   ├── Estado de Líneas
│   ├── Alertas Críticas
│   └── Recomendaciones
├── 4. Análisis de Competencia
│   ├── Detectar Overlaps
│   └── Conflictos Horarios
├── 5. Validador de Cartones
├── 6. Simulador de Horarios
├── 7. Monitoreo STM
├── 8. Troubleshooting
└── 9. Contacto de Soporte
```

### Guía Técnica de Deployment

Secciones:
- Instalación de dependencias
- Configuración de variables de entorno
- Setup de Firebase Firestore
- Escalado automático
- Backups y recovery
- Troubleshooting técnico
- Hotlines de soporte

---

## 🔄 DISASTER RECOVERY

### RTO/RPO Targets

| Escenario | RTO | RPO |
|-----------|-----|-----|
| Pérdida de BD | 1 hora | 15 min |
| Crash de API | 5 min | 0 min (stateless) |
| Corrupción datos | 2 horas | 30 min (backup) |
| Pérdida de código | 30 min | 0 min (Git) |

### Backup Strategy

```bash
# Backups automáticos de Firestore
- Diarios a las 02:00 UTC
- Retenidos 30 días
- Ubicación: gs://transformafacil-backups/

# Backups de código
- En Git (GitHub)
- Ramas: main, develop, hotfix/*

# Backups de configuración
- En Cloud Secret Manager
- Versionados
- Auditados
```

### Recovery Procedures

**Escenario: Corrupción de datos de competencia**
```bash
1. Detener sincronización STM (disable Cloud Scheduler)
2. Restaurar backup de Firestore de hace 24h
3. Validar integridad de datos
4. Resinc desde STM API
5. Monitorear alertas
6. Documentar incidente
```

---

## 👥 CAPACITACIÓN DE USUARIOS

### Programa de Entrenamiento

**Semana 1: Básico**
- [ ] Login y navegación
- [ ] Entender dashboard
- [ ] Interpretar KPIs
- [ ] Quiz de comprensión

**Semana 2: Intermedio**
- [ ] Usar simulador de horarios
- [ ] Analizar competencia
- [ ] Generar reportes
- [ ] Taller práctico

**Semana 3: Avanzado**
- [ ] Integración con sistemas internos
- [ ] APIs para integraciones custom
- [ ] Exportar datos
- [ ] Certificación

### Materiales de Capacitación

1. **Videos tutoriales** (5-10 min cada uno)
   - "Cómo acceder al dashboard"
   - "Interpretar alertas"
   - "Usar el simulador"
   - "Entender proyecciones"

2. **Documentos**
   - Manual en PDF
   - Guía rápida (1 página)
   - FAQ
   - Glosario

3. **Webinars**
   - Lanzamiento (1 hora)
   - Preguntas & Respuestas (semanales)
   - Casos de uso (2x por mes)

### Soporte Post-Lanzamiento

**Canales de soporte:**
- Email: soporte@transformafacil.com (24h response)
- Chat: Slack workspace dedicado
- Teléfono: +598-XXXX-XXXX (horario comercial)
- Portal: https://support.transformafacil.com

**SLA de respuesta:**
- Crítica: <1 hora
- Alta: <4 horas
- Media: <24 horas
- Baja: <48 horas

---

## 📈 CHECKLIST FINAL

### Pre-Launch (1 semana antes)

- [ ] Todos los tests pasando (>85% cobertura)
- [ ] Performance benchmarks completados
- [ ] Documentación 100% completa
- [ ] Usuarios capacitados
- [ ] Backups configurados
- [ ] Monitoreo activado
- [ ] Plan de rollback listo
- [ ] Equipo de soporte preparado

### Launch Day

- [ ] Comunicado a operadores
- [ ] Ambiente de producción verde
- [ ] Equipo de soporte en línea
- [ ] Monitoreo de métricas
- [ ] Logs en tiempo real
- [ ] Canales de comunicación abiertos

### Post-Launch (Primera semana)

- [ ] Monitoreo 24/7
- [ ] Reporte diario de incidentes
- [ ] Feedback de usuarios
- [ ] Hotfixes si necesario
- [ ] Validar SLA de performance
- [ ] Optimizaciones basadas en uso real

---

## 📊 MÉTRICAS DE ÉXITO

| KPI | Meta | Éxito |
|-----|------|-------|
| Uptime | 99.5% | > 99% |
| Latencia p95 | <500ms | ✓ |
| Error rate | <0.1% | ✓ |
| User adoption | >90% | ✓ |
| NPS Score | >8/10 | ✓ |
| Support tickets | <10/día | ✓ |

---

## 🎯 TIMELINE RECOMENDADO

| Fase | Duración | Fechas |
|------|----------|--------|
| Testing | 1 semana | Mar 13-19 |
| Pre-launch prep | 3 días | Mar 20-22 |
| Staging | 2 días | Mar 23-24 |
| **LAUNCH** | 1 día | Mar 25 |
| Post-launch monitoring | 1 semana | Mar 26-Apr 1 |
| Stabilization | 2 semanas | Apr 2-15 |

---

## ✅ ESTADO

**Desarrollo:** ✅ COMPLETADO (Semanas 1-11)
**Testing:** ⏳ EN PROGRESO (Semana 12)
**Deployment:** ⏳ PENDIENTE (Semana 12)
**Monitoreo:** ⏳ PENDIENTE (Semana 12)

**Próximo hito:** Go-live a producción

---

**Documento versión:** 1.0
**Última actualización:** Marzo 13, 2026
**Estado:** READY FOR EXECUTION
