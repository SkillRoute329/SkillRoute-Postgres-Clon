# 🔴 DIAGNÓSTICO CRÍTICO: Módulos de Agents e Intelligence
**Sistema:** TransformaFacil 2.0
**Fecha:** Abril 2026
**Estado:** Proyecto bloqueado en producción

---

## 🎯 PROBLEMA RAÍZ IDENTIFICADO

Tu proyecto **tiene 2 módulos críticos paralizados:**

### 1. **CompetitorIntelligencePage.tsx** (Dashboard de Inteligencia)
**Ubicación:** `/frontend/src/pages/traffic/CompetitorIntelligencePage.tsx`

**Dependencia crítica NO RESUELTA:**
```
CompetitorIntelligencePage.tsx
    ↓
Busca Bridge Server en: http://localhost:3099
    ↓
❌ BRIDGE SERVER NO EXISTE O NO ESTÁ CORRIENDO
```

**Lo que espera:**
- `GET /health` → verificar disponibilidad
- `GET /api/lines/ucot` → obtener todas las líneas UCOT con buses en tiempo real
- `GET /api/analysis/{linea}` → análisis competitivo por línea

**Lo que falta:**
El Bridge Server que se supone debe conectarse a la API STM Montevideo para extraer datos reales de buses y competencia.

---

### 2. **DigitalAgentsModule.tsx** (Agentes Digitales)
**Ubicación:** `/frontend/src/pages/traffic/DigitalAgentsModule.tsx`

**Problemas identificados:**

#### 2.1 Los agentes NO evalúan competencia en tiempo real
```typescript
// LÍNEA 111: define competitorReport como null
competitorReport: ReporteInteligenciaCompetitiva | null;

// Pero nunca se calcula automáticamente basado en:
// - Horarios públicos reales de líneas
// - Posicionamiento actual de unidades (IMM)
// - Competencia en el corredor
```

#### 2.2 Falta lógica para comparar:
```typescript
// El módulo TIENE datos:
- serviciosActivos: ServicioActivo[]  // ✅ Horarios de línea actual
- posicionesIMM: IMMPosition[]         // ✅ Posición real de unidades
- LINE_INSPECTOR_CONFIGS              // ✅ Config de líneas

// Pero NO HACE nada con ellos para evaluar competencia:
- No calcula frecuencia REAL vs PROGRAMADA
- No detecta competidores cercanos
- No mide puntualidad por punto de control
- No genera recomendaciones basadas en datos
```

#### 2.3 El tipo `ReporteInteligenciaCompetitiva` está indefinido
```typescript
// LÍNEA 43: Importa un tipo que probablemente no existe
import type { ReporteInteligenciaCompetitiva } from '../../services/CompetitorIntelligenceEngine';

// ❌ No existe /services/CompetitorIntelligenceEngine
// Existe: /src/services/intelligence/ (pero vacío o incompleto)
```

---

## 📊 ANÁLISIS DE ARQUITECTURA ACTUAL

### Lo que SÍ funciona:
✅ Backend bien estructurado (Express + Firestore)
✅ Frontend con componentes React modernos
✅ Datos maestros disponibles (ucot_master_intelligence_2026)
✅ Configuración de inspectores (LINE_INSPECTOR_CONFIGS)
✅ Estructura de directorios clara

### Lo que NO funciona:
❌ **Bridge Server** entre Frontend y STM API (localhost:3099)
❌ **Motor de Inteligencia Competitiva** (CompetitorIntelligenceEngine)
❌ **Cálculo automático de evaluaciones** en agentes
❌ **Integración IMM API** para posiciones reales

---

## 🛠️ SOLUCIÓN ESPECÍFICA (3 PASOS)

### PASO 1: Crear el Bridge Server (Crítico)
**Ubicación:** `/backend/src/services/bridgeServer.ts` (NUEVO)

El Bridge debe:
1. Conectar a la API STM/IMM real
2. Extraer líneas UCOT con buses activos
3. Calcular competencia por línea
4. Servir en puerto 3099 con endpoints esperados

```
Backend Principal (3002)
    ↓
Bridge Server (3099) ← AGREGAR ESTO
    ↓
STM/IMM API (datos reales)
    ↓
Frontend (obtiene datos reales)
```

---

### PASO 2: Implementar CompetitorIntelligenceEngine
**Ubicación:** `/frontend/src/services/intelligence/CompetitorIntelligenceEngine.ts` (CREAR)

Funciones necesarias:
```typescript
export interface ReporteInteligenciaCompetitiva {
  linea: string;
  timestamp: string;
  competidoresDirectos: CompetidorDetectado[];
  analisisFrequencia: AnalisisFrequencia;
  puntualidadPromedio: number;
  alertasCompetencia: AlertaCompetencia[];
  recomendacionesTacticas: RecomendacionTactica[];
}

export function analizarCompetenciaLinea(
  serviciosActivos: ServicioActivo[],
  posicionesIMM: IMMPosition[],
  competidoresCercanos: CompetidorCercano[]
): ReporteInteligenciaCompetitiva
```

---

### PASO 3: Actualizar DigitalAgentsModule para calcular automáticamente
**Cambios en:** `/frontend/src/pages/traffic/DigitalAgentsModule.tsx`

Agregar hook que:
1. Obtiene datos de Bridge Server cada 30 segundos
2. Calcula report de competencia automáticamente
3. Genera recomendaciones tácticas basadas en datos reales
4. Actualiza UI con métricas en tiempo real

---

## 📋 CHECKLIST PARA RESOLVER

- [ ] **URGENTE:** ¿Existe la API STM que mencionas? ¿Cuál es el endpoint real?
- [ ] ¿Tienes acceso a datos IMM (posiciones de buses) en tiempo real?
- [ ] ¿El "Bridge Server" ya existe en algún lado o hay que crearlo desde cero?
- [ ] ¿Cuáles son las credenciales/keys para acceder a datos reales de STM?
- [ ] ¿Necesitas que el análisis sea **síncrono** (tiempo real) o **asíncrono** (batch)?

---

## ⏱️ IMPACTO EN POSTULACIÓN

Como **Jefe de Tránsito**, tu evaluación debe demostrar:

1. **Evaluación de competencia en tiempo real** ✅
   - Detectar líneas rivales
   - Medir frecuencia actual vs programada
   - Alertas automáticas

2. **Posicionamiento geográfico de unidades** ✅
   - Mostrar buses en mapa
   - Calcular distancia a competidores
   - Análisis por corredor

3. **Reportes de competencia por horario** ✅
   - Horarios públicos de todas las líneas
   - Ocupación por banda horaria
   - Proyecciones de revenue

4. **Recomendaciones automáticas** ✅
   - Ajustes de frecuencia
   - Desvíos estratégicos
   - Refuerzo de líneas

**ACTUALMENTE:** Tus módulos tienen ESTRUCTURA pero sin FUNCIONALIDAD

---

## 🎓 CONTEXTO PARA TU POSTULACIÓN

Cuando postules a Jefe de Tránsito del Metropolitano, debes presentar:

> *"Mi sistema realiza evaluación autónoma de competencia basada en:*
>
> - *Horarios públicos de todas las líneas del corredor*
> - *Posicionamiento geográfico en tiempo real de cada unidad*
> - *Cálculo automático de frecuencia real (minutos entre buses)*
> - *Detección de oportunidades de revenue*
> - *Generación automática de recomendaciones tácticas"*

**Actualmente SIN BRIDGE SERVER:** Solo puedes mostrar mockups/simulaciones

---

## 📞 PRÓXIMO PASO

Necesito que me confirmes:

1. **¿Tienes acceso a la API STM Montevideo?**
   - Endpoint URL
   - Credenciales
   - Formato de respuesta

2. **¿Dónde está el Bridge Server?**
   - ¿Ya existe en otro proyecto?
   - ¿Hay que crearlo?
   - ¿Qué tecnología usaste?

3. **¿Cuál es el formato de datos IMM?**
   - ¿Cómo obtiene posiciones de buses?
   - ¿API REST o Socket.io?
   - Latencia máxima esperada?

**Con esa información, te entrego:**
- ✅ Bridge Server funcional
- ✅ Motor de inteligencia competitiva
- ✅ Agentes operativos evaluando en tiempo real
- ✅ Lista de cambios para postulación
