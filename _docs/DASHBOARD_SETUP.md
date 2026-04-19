# GUÍA DE CONFIGURACIÓN: DASHBOARD EJECUTIVO
## TransformaFacil 2.0 - Centro de Comando Unificado

---

## 📋 CONTENIDO

1. [Instalación](#instalación)
2. [Configuración Rápida](#configuración-rápida)
3. [Rutas API](#rutas-api)
4. [Componentes React](#componentes-react)
5. [Ejemplos de Uso](#ejemplos-de-uso)
6. [Solución de Problemas](#solución-de-problemas)

---

## 🚀 INSTALACIÓN

### Backend

Todas las dependencias necesarias ya están incluidas:
- Express.js
- Firebase (Firestore)
- TypeScript
- Winston (logging)

No requiere instalación adicional.

### Frontend

Todas las librerías necesarias ya están incluidas:
- React 18+
- TypeScript
- Lucide React (iconos)
- Recharts (gráficos)
- Tailwind CSS (estilos)

No requiere instalación adicional.

---

## ⚙️ CONFIGURACIÓN RÁPIDA

### Paso 1: Iniciar Backend

```bash
cd backend
npm run dev
```

Backend estará en: `http://localhost:3000`

### Paso 2: Iniciar Frontend

```bash
cd frontend
npm start
```

Frontend estará en: `http://localhost:3001`

### Paso 3: Autenticación

1. Ir a `http://localhost:3001/login`
2. Usar credenciales de manager/admin
3. InternalNumber: tu número interno
4. Password: tu contraseña

### Paso 4: Acceder al Dashboard

Una vez autenticado:
```
http://localhost:3001/dashboard/UCOT
```

Reemplaza `UCOT` con tu operador.

---

## 🔗 RUTAS API

### Dashboard Principal

```bash
GET /api/dashboard/executive/:operador
```
Retorna dashboard completo con todas las secciones.

**Header requerido:**
```
Authorization: Bearer <JWT_TOKEN>
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": "dashboard-UCOT-1234567890",
    "operador": "UCOT",
    "fecha": "2026-03-13T12:00:00Z",
    "salud_operacional": { ... },
    "metricas": { ... },
    "lineas": [ ... ],
    "resumen_competitivo": { ... },
    "proyecciones": [ ... ],
    "recomendaciones": [ ... ],
    "alertas_criticas": [ ... ],
    "resumen_texto": "..."
  }
}
```

### Rutas Granulares (más rápidas)

```bash
# Solo métricas
GET /api/dashboard/metricas/:operador

# Estado de líneas
GET /api/dashboard/lineas/:operador

# Alertas críticas
GET /api/dashboard/alertas/:operador

# Recomendaciones
GET /api/dashboard/recomendaciones/:operador

# Salud operacional
GET /api/dashboard/salud/:operador

# Proyecciones
GET /api/dashboard/proyecciones/:operador

# Resumen texto
GET /api/dashboard/resumen/:operador
```

---

## 🎨 COMPONENTES REACT

### Usar ExecutiveDashboard en tu App

```typescript
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';

export function MyApp() {
  const operador = 'UCOT'; // O desde localStorage/context

  return <ExecutiveDashboard operador={operador} />;
}
```

### Props

```typescript
interface ExecutiveDashboardProps {
  operador: string; // Código del operador (ej: 'UCOT', 'CUTCSA')
}
```

### Usar Hooks Individuales

```typescript
import { useDashboardData, useMetricas, useAlertas } from '@/hooks/useDashboardData';

function MyComponent() {
  const { metricas, salud } = useMetricas('UCOT');
  const { alertas } = useAlertas('UCOT');

  return (
    <div>
      <h1>Ingresos: ${metricas?.ingresosTotales.valor}</h1>
      <p>Alertas: {alertas.length}</p>
    </div>
  );
}
```

### Componentes Individuales

```typescript
import { KPICard } from '@/components/dashboard/KPICard';
import { SaludOperacionalCard } from '@/components/dashboard/SaludOperacionalCard';
import { LineasStatusPanel } from '@/components/dashboard/LineasStatusPanel';

function MyDashboard() {
  const { metricas, salud, lineas } = useDashboardData('UCOT');

  return (
    <>
      {metricas && <KPICard kpi={metricas.ingresosTotales} />}
      {salud && <SaludOperacionalCard salud={salud} />}
      {lineas && <LineasStatusPanel lineas={lineas} />}
    </>
  );
}
```

---

## 📊 EJEMPLOS DE USO

### Ejemplo 1: Dashboard Completo

```typescript
import { ExecutiveDashboard } from '@/components/dashboard/ExecutiveDashboard';

function DashboardPage() {
  return <ExecutiveDashboard operador="UCOT" />;
}
```

**Resultado:**
- ✅ Pantalla completa con tabs (Overview, Líneas, Alertas, Recomendaciones)
- ✅ KPIs principales
- ✅ Salud operacional
- ✅ Auto-refresh cada 5 minutos
- ✅ Botón "Actualizar" manual

### Ejemplo 2: Mini-Dashboard (Solo Métricas)

```typescript
import { useMetricas } from '@/hooks/useDashboardData';

function MetricasWidget() {
  const { metricas, salud, loading } = useMetricas('UCOT');

  if (loading) return <p>Cargando...</p>;

  return (
    <div className="bg-white p-4 rounded">
      <h2>Salud Operacional: {salud?.estado}</h2>
      <p>Ingresos: ${metricas?.ingresosTotales.valor}</p>
      <p>Score: {salud?.indiceGeneral}/100</p>
    </div>
  );
}
```

### Ejemplo 3: Alertas en Tiempo Real

```typescript
import { useAlertas } from '@/hooks/useDashboardData';
import { AlertTriangle } from 'lucide-react';

function AlertasWidget() {
  const { alertas, total } = useAlertas('UCOT');

  if (total === 0) {
    return <p>✓ Sin alertas críticas</p>;
  }

  return (
    <div className="bg-red-50 border border-red-300 rounded p-4">
      <h3 className="flex items-center gap-2">
        <AlertTriangle /> {total} Alertas
      </h3>
      {alertas.map((alerta, idx) => (
        <div key={idx} className="mt-2 p-2 bg-white rounded">
          <p className="font-bold">{alerta.tipo}</p>
          <p className="text-sm">{alerta.mensaje}</p>
        </div>
      ))}
    </div>
  );
}
```

### Ejemplo 4: Recomendaciones para Ejecutivo

```typescript
import { useRecomendaciones } from '@/hooks/useDashboardData';

function ExecutiveRecommendations() {
  const { recomendaciones, impacto_total } = useRecomendaciones('UCOT');

  return (
    <div className="space-y-4">
      <h2>Impacto Total Potencial: ${impacto_total / 1000}K/mes</h2>
      {recomendaciones.map((rec) => (
        <div key={rec.id} className="border-l-4 border-green-500 p-4 bg-green-50">
          <h3>{rec.titulo}</h3>
          <p>{rec.descripcion}</p>
          <p className="text-sm mt-2">
            Impacto: ${rec.impacto}
            <br />
            Urgencia: {rec.urgencia}
            <br />
            Éxito: {rec.probabilidadExito}%
          </p>
        </div>
      ))}
    </div>
  );
}
```

---

## 🔧 SOLUCIÓN DE PROBLEMAS

### Error: "Error obteniendo dashboard"

**Causa:** JWT expirado o no validado.

**Solución:**
1. Verificar que el token JWT está en localStorage
2. Verificar que el usuario tiene rol 'admin' o 'manager'
3. Hacer login nuevamente

### Error: "No tienes permiso para acceder a este dashboard"

**Causa:** Usuario intenta acceder a operador diferente.

**Solución:**
1. Cambiar URL: `/dashboard/TUCOPERADOR`
2. O pedir a admin que le asigne acceso a otros operadores

### Dashboard tarda mucho en cargar

**Causa:** Primera carga con muchas líneas/cartones.

**Solución:**
1. Usar endpoints granulares (`/metricas` en lugar de `/executive`)
2. Implementar caching en frontend (localStorage)
3. Usar `useMetricas` en lugar de `useDashboardData` para widgets

### Los datos no se actualizan

**Causa:** Auto-refresh desactivado.

**Solución:**
```typescript
// Habilitar auto-refresh
const { refetch } = useDashboardData('UCOT', {
  autoRefresh: true,
  refreshInterval: 300000 // 5 minutos
});

// O actualizar manualmente
<button onClick={refetch}>Actualizar Ahora</button>
```

### Alerta: "Confianza baja en proyecciones"

**Causa:** Datos históricos insuficientes.

**Solución:**
1. Esperar a que se acumulen más datos
2. Usar proyecciones con confianza > 70% para decisiones
3. Combinar con análisis manual

---

## 📈 MÉTRICAS Y MONITOREO

### KPIs Disponibles

| Métrica | Descripción | Rango Normal |
|---------|-------------|--------------|
| **Ingresos Totales** | Suma de todos los ingresos | $5M - $15M/mes |
| **Pasajeros Totales** | Total de pasajeros transportados | 100K - 300K/mes |
| **Líneas Activas** | Número de líneas operando | 10-50 |
| **Ocupación Promedio** | % de asientos ocupados | 70% - 90% |
| **Cumplimiento Horario** | % de viajes a horario | 90% - 98% |

### Alertas

**Severidades:**
- 🔴 **Crítica**: Acción inmediata requerida
- 🟠 **Alta**: Abordar en 24 horas
- 🟡 **Media**: Abordar en 1 semana
- 🔵 **Baja**: Monitorear

### Recomendaciones

Se generan automáticamente basadas en:
1. Conflictos competitivos detectados
2. Cartones marginales/no viables
3. Tendencias de crecimiento
4. Caídas de pasajeros

---

## 🔐 SEGURIDAD

### Tokens JWT

```bash
# Header requerido
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Roles Permitidos

- ✅ `admin` - Acceso a todos los operadores
- ✅ `manager` - Acceso solo a su operador
- ❌ `driver`, `user` - Sin acceso a dashboard

### Validación Multi-nivel

1. **Middleware de rutas**: `requireAuth`
2. **Controlador**: Valida operador vs usuario
3. **Servicio**: Filtra datos por operador
4. **Base de datos**: Query con where operador

---

## 📞 SOPORTE

### Logs Disponibles

Backend (Winston):
```bash
tail -f logs/app.log
```

Frontend (Console):
```javascript
// En navegador DevTools > Console
console.log(dashboard); // Ver estructura completa
```

### Debugging

```typescript
// Activar logs en hooks
const { dashboard, error, loading } = useDashboardData('UCOT');

useEffect(() => {
  console.log('Dashboard:', dashboard);
  console.log('Error:', error);
  console.log('Loading:', loading);
}, [dashboard, error, loading]);
```

---

## 📌 PRÓXIMAS ACTUALIZACIONES

- ✏️ Editar recomendaciones directamente desde UI
- 📊 Exportar dashboard a PDF
- 📧 Enviar alertas por email/SMS
- 📱 App móvil nativa
- 🤖 ML predictions para proyecciones

---

**Última actualización:** Marzo 2026
**Versión:** 2.0.0
**Estado:** Producción Ready ✅
