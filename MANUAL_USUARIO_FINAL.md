# MANUAL DE USUARIO: TransformaFacil 2.0
## Centro de Comando Unificado para Operadores de Transporte

**Versión:** 2.0.0
**Fecha:** Marzo 2026
**Audiencia:** Gerentes, Coordinadores, Operadores de Transporte

---

## 📖 ÍNDICE

1. [Inicio Rápido](#inicio-rápido)
2. [Autenticación](#autenticación)
3. [Dashboard Ejecutivo](#dashboard-ejecutivo)
4. [Análisis de Competencia](#análisis-de-competencia)
5. [Simulador de Horarios](#simulador-de-horarios)
6. [Monitoreo STM](#monitoreo-stm)
7. [Reportes y Exportación](#reportes-y-exportación)
8. [Troubleshooting](#troubleshooting)
9. [Contacto de Soporte](#contacto-de-soporte)

---

## 🚀 INICIO RÁPIDO

### Requisitos
- Navegador moderno (Chrome 90+, Firefox 88+, Safari 14+)
- Conexión a internet
- Credenciales de usuario (internalNumber y contraseña)

### Acceder al Sistema

1. Abre: `https://app.transformafacil.com`
2. Verás la pantalla de login
3. Ingresa tu número interno (ej: 1234)
4. Ingresa tu contraseña
5. Haz click en "Ingresar"

![login-screen]

### Tu Primer Dashboard

Una vez autenticado, verás:
- **KPIs principales** (ingresos, pasajeros, ocupación)
- **Salud operacional** (score 0-100)
- **Alertas críticas** (si hay)
- **Recomendaciones** (acciones sugeridas)

```
Tip: Si es tu primera vez, haz click en el ícono ?
en la esquina superior para ver un tutorial interactivo
```

---

## 🔐 AUTENTICACIÓN

### Ingresar al Sistema

```
1. Ir a https://app.transformafacil.com
2. Campo "Número Interno": tu número de empleado
3. Campo "Contraseña": tu contraseña personal
4. Click en botón "Ingresar"
```

### Recuperar Contraseña

¿Olvidaste tu contraseña?

1. Click en "¿Olvidaste tu contraseña?"
2. Ingresa tu número interno
3. Recibirás un email con instrucciones
4. Haz click en el link de recuperación
5. Crea una nueva contraseña
6. Ingresa con tus nuevas credenciales

### Cambiar Contraseña

Para cambiar tu contraseña:

1. Haz click en tu nombre (esquina superior derecha)
2. Selecciona "Mi perfil"
3. Click en "Cambiar contraseña"
4. Ingresa contraseña actual
5. Ingresa contraseña nueva (mín 8 caracteres)
6. Confirma la nueva contraseña
7. Click en "Actualizar"

### Cerrar Sesión

```
Click en tu nombre (esquina superior derecha)
→ Selecciona "Cerrar sesión"
→ Serás redirigido a la pantalla de login
```

**Importante:** Siempre cierra sesión en computadoras compartidas

---

## 📊 DASHBOARD EJECUTIVO

### Descripción General

El Dashboard Ejecutivo es tu centro de comando. Aquí tienes una visión 360° de tu operación:

**Panel Superior:**
- **Salud Operacional** - Score general (0-100)
- **Operador Activo** - Tu operador seleccionado
- **Botón Actualizar** - Fuerza actualización manual

### Sección 1: KPIs Principales

Cinco métricas clave en el overview:

#### 1. Ingresos Totales
```
Qué es: Total de dinero generado en el período
Cálculo: Pasajeros × 56 pesos + especiales
Cambio: % comparado con mes anterior
Objetivo: Meta de ingresos para el período
Interpretación:
  Verde (+): Superaste tu objetivo
  Rojo (-): Estás por debajo del objetivo
```

**Acciones:**
- Si es rojo, click para ver detalles
- Identifica líneas con bajos ingresos
- Usa simulador para evaluar cambios

#### 2. Pasajeros Totales
```
Qué es: Cantidad de personas transportadas
Cálculo: Sum de todos los viajes
Cambio: % vs mes anterior
Rojo: Caída >5% = preocupante
Verde: Crecimiento = excelente
```

#### 3. Líneas Activas
```
Qué es: Número de rutas en operación
Mostrado: Total de líneas
Cambio: Generalmente estable (0%)
Rojo: Si alguna línea se paró = requiere atención
```

#### 4. Ocupación Promedio
```
Qué es: % de asientos llenos en promedio
Rango normal: 70-85%
Rojo (>90%): Buses llenos, considera agregar servicios
Verde (85%+): Excelente utilización
Amarillo (60-70%): Espacio disponible
```

#### 5. Cumplimiento Horario
```
Qué es: % de viajes que salen a la hora
Meta: >95%
Rojo (<90%): Retrasos sistemáticos
Verde (>95%): Excelente puntualidad
```

### Sección 2: Salud Operacional

**Ubicación:** Tarjeta prominente con score

```
EXCELENTE (80-100)    🟢 Verde
  → Sistema funcionando perfectamente
  → Todas las líneas operativas
  → Sin alertas críticas

BUENO (60-79)         🔵 Azul
  → Sistema funcionando bien
  → 1-2 líneas en riesgo
  → Pocas alertas media

REGULAR (40-59)       🟡 Amarillo
  → Sistema en atención
  → Varias líneas problemáticas
  → Múltiples alertas

CRÍTICO (<40)         🔴 Rojo
  → Sistema en crisis
  → >50% líneas afectadas
  → Acción inmediata requerida
```

**Indicadores dentro:**
- **Líneas Operativas:** % de líneas sin problemas
- **Líneas en Riesgo:** % con caída de pasajeros
- **Cartones No Viables:** % con pérdidas

### Tabs de Navegación

#### TAB 1: OVERVIEW
Mostrado por defecto. Contiene:
- KPIs principales
- Salud operacional
- Proyecciones de ingresos
- Resumen ejecutivo en texto

#### TAB 2: LÍNEAS
Grid de todas tus líneas con:
- Número de línea (grande)
- Estado (operativa/marginal/riesgo/crítica)
- Ingresos diarios
- Pasajeros diarios
- Cumplimiento horario
- Ocupación %
- Competidores detectados
- Alertas específicas

**Acciones:**
- Click en una línea → ver detalles
- Filtrar por estado (operativa, riesgo, etc.)
- Exportar lista

#### TAB 3: ALERTAS
Todas las alertas críticas y medias

```
Por cada alerta ves:
├─ Icono de severidad (rojo/naranja/amarillo/azul)
├─ Tipo (competencia, ocupación, ingresos, marginal)
├─ Mensaje descriptivo
├─ Acción recomendada
└─ Expandible para más detalles
```

**Filtros disponibles:**
- Por severidad (crítica, alta, media, baja)
- Por tipo (competencia, ingresos, ocupación)

**Acciones:**
- Click para expandir detalles
- "Resolver" si ya fue solucionado
- Crear ticket de soporte

#### TAB 4: RECOMENDACIONES
3-5 recomendaciones prioritarias

```
Por cada recomendación:
├─ Título (ej: "Responder a competencia")
├─ Descripción detallada
├─ Impacto estimado ($180K/mes)
├─ Urgencia (alta/media/baja)
├─ Acción sugerida
├─ Líneas afectadas
├─ Probabilidad de éxito (78%)
└─ Tiempo implementación (1-3 días)
```

**Ejemplo:**
```
RECOMENDACIÓN: Responder a movimiento de Cutcsa
├─ Impacto: +$180K/mes si implementas
├─ Urgencia: ALTA
├─ Acción: Ejecuta simulador de horarios
│  → Adelanta línea 3 en 15 minutos
│  → Implementa en 24 horas
└─ Probabilidad éxito: 78%
```

---

## 🔍 ANÁLISIS DE COMPETENCIA

### Acceder

En el menú principal:
```
Análisis → Competencia
```

O desde dashboard:
```
Click en "Ver más" en sección de competencia
```

### Qué ves

**1. Líneas Competidoras Detectadas**

Para cada línea tuya, ves:

```
Línea 10 (UCOT)
├─ Línea 3 (Cutcsa) - 45% sobreposición
├─ Línea 5 (COME) - 30% sobreposición
└─ Línea 15 (COETC) - 25% sobreposición

Línea 15 (UCOT)
├─ Línea 8 (Cutcsa) - 60% sobreposición
└─ [Sin competencia directa en otras horas]
```

**2. Conflictos Horarios**

Cuando competidores salen a la misma hora o <30 min después:

```
CRÍTICA: Línea 3 (Cutcsa)
├─ Tu línea 10 sale a las 09:15
├─ Cutcsa sale a las 09:00 (15 min antes)
├─ Pasajeros en riesgo: 45
├─ Recomendación: Adelanta tu servicio
└─ Acción: Abrir simulador
```

### Interpretar Datos

**¿Qué significa 45% de sobreposición?**

Significa que el 45% del recorrido de tu línea coincide con la competencia.

```
Ejemplo: Tu línea 10
- Recorre 20 paradas (Centro → Este)
- Línea 3 de Cutcsa
- Recorre paradas 1-9 de tu ruta (9 de 20)
- 45% de coincidencia

Riesgo: Competidor puede capturar
tus pasajeros en esas 9 paradas
```

**Severidad de conflicto:**

```
CRÍTICA: Tu línea viene 30+ min después
  → Pasajeros esperan más tiempo
  → Pierdes >30% de pasajeros
  → Requiere acción inmediata

ALTA: Tu línea viene 15-30 min después
  → Pasajeros pueden esperar
  → Pierdes 10-20% de pasajeros
  → Acción recomendada

MEDIA: Tu línea viene 5-15 min después
  → Competencia cercana
  → Pierdes 5-10% de pasajeros
  → Monitorear

BAJA: Tu línea viene >30 min después
  → Diferente segmento horario
  → Riesgo bajo
```

### Acciones

**Si ves competencia:**

1. **Analizar impacto**
   - ¿Cuántos pasajeros pierdes?
   - ¿En qué paradas?
   - ¿A qué hora?

2. **Evaluar respuesta**
   - Usa el simulador de horarios
   - "¿Qué pasa si adelanto 15 min?"
   - Ver impacto estimado

3. **Decidir acción**
   - Adelantar el servicio
   - Aumentar frecuencia
   - Agregar paradas estratégicas
   - Cambiar horario

4. **Implementar**
   - Ejecuta la acción
   - Monitorea impacto
   - Ajusta si es necesario

---

## ⏱️ SIMULADOR DE HORARIOS

### Acceder

Desde cualquier alerta de competencia:
```
Click en "Abrir simulador de horarios"
```

O desde el menú:
```
Herramientas → Simulador de Horarios
```

### Cómo Usar

**Paso 1: Seleccionar línea**
```
Dropdown: Selecciona tu línea (ej: "Línea 10")
```

**Paso 2: Ingresa el cambio**
```
Campo "Nuevo horario": Ingresa la hora nueva
  Ej: Si ahora sales a 09:15, ingresa 09:00
  (para adelanto de 15 minutos)
```

**Paso 3: Selecciona razón**
```
Dropdown: ¿Por qué cambias el horario?
├─ Competencia (adelanto detectado)
├─ Demanda (más pasajeros a esa hora)
├─ Mantenimiento
└─ Otro
```

**Paso 4: Ejecuta simulación**
```
Click: "Simular cambio"
```

### Interpretar Resultados

El simulador te muestra:

**ESCENARIO ACTUAL**
```
Horario actual: 09:15
Pasajeros estimados: 156 pers/día
Ingresos estimados: $8,736/día
Cumplimiento: 95%
```

**ESCENARIO NUEVO**
```
Nuevo horario: 09:00
Pasajeros estimados: 175 pers/día (+12%)
Ingresos estimados: $9,800/día (+12%)
Cumplimiento: 92% (-3%)
Impacto neto: +$1,064/día = +$23,408/mes
```

**VEREDICTO**
```
✓ RECOMENDADO
Razón: Ganancia estimada supera los costos
Probabilidad éxito: 78%
Tiempo implementación: 24 horas
Riesgo: BAJO
```

### Ejemplo Completo

```
Tu línea 10:
- Actualmente sale a las 09:15
- Competidor Cutcsa sale a las 09:00
- Pierdes ~45 pasajeros/día a esa hora

Abres simulador:
1. Selecciona: "Línea 10"
2. Ingresa nuevo horario: "09:00"
3. Razón: "Competencia"
4. Simula...

RESULTADO:
┌─────────────────────────────────────┐
│ IMPACTO MENSUAL ESTIMADO:           │
│                                     │
│ Ingresos adicionales: +$23,408/mes  │
│ Costo implementación: -$2,000       │
│ ROI: +$21,408/mes                  │
│                                     │
│ RECOMENDACIÓN: ✓ ADELANTAR         │
└─────────────────────────────────────┘

PRÓXIMOS PASOS:
1. Informa al gerente de turnos
2. Actualiza horarios en STM
3. Notifica a conductores
4. Implementa en 24 horas
5. Monitorea resultados en dashboard
```

---

## 📡 MONITOREO STM

### Qué es STM

STM (Sistema de Transporte Metropolitano) es el organismo público que regula el transporte en Montevideo.

TransformaFacil se integra con:
- **Datos públicos:** Horarios de todas las líneas
- **Máquinas 5G:** Boletaje y ocupación en tiempo real
- **Alertas automáticas:** Cuando competidores cambian horarios

### Acceder a Monitoreo

```
Menú → Monitoreo STM
```

### Qué Ves

**Panel de Calidad STM**
```
┌───────────────────────────────────┐
│ CALIDAD DE DATOS STM: EXCELENTE   │
├───────────────────────────────────┤
│ Máquinas activas: 234/250         │
│ Sincronización: 96.8%             │
│ Transacciones hoy: 12,456         │
│ Latencia promedio: 140ms          │
│ API disponible: 99.8%             │
└───────────────────────────────────┘
```

**Líneas Monitoreadas**

Grid con todas las líneas públicas (tuyas y competencia)

```
Línea 10 (UCOT)
├─ Ruta: Centro → Este
├─ Distancia: 12.5 km
├─ Frecuencia: Cada 15 min
├─ Paradas: 22
└─ [Ver horarios]

Línea 3 (Cutcsa)  ← COMPETENCIA
├─ Ruta: Centro → Pocitos
├─ Distancia: 14.2 km
├─ Frecuencia: Cada 10 min
└─ ALERTA: Adelantó horarios hace 2 días
```

### Cambios Detectados

Cuando STM publica nuevos horarios:

```
🔴 CRÍTICA: Línea 3 (Cutcsa)
├─ Tipo: ADELANTO
├─ Hora anterior: 09:15
├─ Hora nueva: 09:00
├─ Diferencia: -15 minutos
├─ Pasajeros en riesgo: 45
├─ Acción recomendada: Ejecuta simulador
└─ [Abrir simulador]
```

### Qué Hacer

Si ves un cambio de competencia:

1. **Analiza el impacto**
   - ¿Qué línea tuya se ve afectada?
   - ¿Cuántos pasajeros pierdes?
   - ¿Es crítico o medio?

2. **Evalúa tu respuesta**
   - Abre el simulador
   - Prueba adelantar tu horario
   - Ver impacto estimado

3. **Decide si responder**
   - ¿Vale la pena?
   - ¿Tienes capacidad?
   - ¿Qué dicen tus datos?

4. **Implementa rápido**
   - STM cambia → tú debes actuar en 24h
   - Informa a operadores
   - Ejecuta el cambio
   - Monitorea resultados

---

## 📊 REPORTES Y EXPORTACIÓN

### Generar Reportes

**Opción 1: Desde Dashboard**
```
Click en botón "Descargar Reporte"
→ Selecciona período (mes, semana, rango)
→ Click "Generar"
→ Descarga PDF o Excel
```

**Opción 2: Desde Menú**
```
Reportes → Crear nuevo reporte
→ Selecciona tipo (ejecutivo, competencia, ingresos)
→ Selecciona período
→ Click "Generar"
```

### Tipos de Reportes Disponibles

**1. Reporte Ejecutivo**
- Resumen de un párrafo del período
- KPIs principales
- Top 3 alertas
- Top 3 recomendaciones
- Ideal para: Presentaciones a directivos

**2. Análisis de Competencia**
- Líneas competidoras detectadas
- Cambios de horarios
- Pasajeros en riesgo
- Recomendaciones de respuesta
- Ideal para: Planificación estratégica

**3. Análisis de Ingresos**
- Ingresos por línea
- Comparación con proyecciones
- Líneas marginales
- Análisis de rentabilidad
- Ideal para: Decisiones de operación

**4. Reporte STM**
- Cambios detectados
- Máquinas sincronizadas
- Calidad de datos
- Alertas de competencia
- Ideal para: Monitoreo operacional

### Exportar Datos

**Opción 1: CSV (para Excel)**
```
Click en tabla → Click en "Exportar CSV"
Se descarga: archivo.csv

Puedes abrir con:
- Microsoft Excel
- Google Sheets
- LibreOffice Calc
```

**Opción 2: PDF (para imprimir)**
```
Click en "Imprimir/PDF"
Selecciona "Guardar como PDF"
Se guarda en tu computadora
```

---

## 🆘 TROUBLESHOOTING

### Problemas Comunes

**1. No puedo ingresar al sistema**

```
Solución:
□ Verifica tu número interno (sin espacios)
□ Verifica tu contraseña (mayúsculas cuentan)
□ Si es correcta, haz click en "¿Olvidaste?"
□ Revisa tu email (spam?)
□ Reinicia navegador
□ Intenta con navegador diferente
□ Contacta a soporte
```

**2. El dashboard no carga o es lento**

```
Solución:
□ Recarga la página (Ctrl+R o F5)
□ Limpia el caché del navegador
  (Ctrl+Shift+Suprimir)
□ Verifica tu conexión a internet
□ Prueba con navegador diferente
□ Intenta más tarde (evita horas pico)
□ Contacta a soporte si persiste
```

**3. Los datos no se actualizan**

```
Solución:
□ Haz click en botón "Actualizar" (esquina superior)
□ Espera 30 segundos (sincronización en tiempo real)
□ Recarga página (F5)
□ Revisa tu conexión a internet
□ Si sigue igual, contacta a soporte
```

**4. No veo alertas de competencia**

```
Posibles razones:
□ No hay cambios nuevos de competidores
□ La sincronización STM aún no corrió (corre a las 00:30)
□ Filtros están activos (revisa en tab Alertas)
□ Tu línea no tiene competencia directa

Para forzar sincronización:
□ Contáctame a soporte
□ Ellos pueden disparar sincronización manual
□ Toma ~5-10 minutos
```

**5. El simulador muestra resultados extraños**

```
Solución:
□ Verifica que ingresaste el horario correcto
□ Formato debe ser: HH:MM (ej: 09:15)
□ Revisa que sea un cambio realista
  (no adelantes más de 1 hora)
□ Si ves errores, contacta a soporte
```

### Contactar a Soporte

Cuando nada funcione:

**Email:** soporte@transformafacil.com
**Tiempo respuesta:** <4 horas

En tu email incluye:
- Tu número interno
- Operador
- Qué problema tienes
- Cuándo empezó
- Qué ya probaste
- Screenshot si es posible

---

## 📞 CONTACTO DE SOPORTE

### Canales Disponibles

| Canal | Disponibilidad | Tiempo Respuesta |
|-------|---|---|
| Email | 24/7 | <4 horas |
| Chat | L-V 8-18h | <1 hora |
| Teléfono | L-V 9-17h | Inmediato |
| Portal web | 24/7 | <24 horas |

### Cómo Reportar Problemas

**Opción 1: Desde el Dashboard**
```
Click en ícono ? (esquina superior derecha)
→ Click en "Reportar problema"
→ Describe qué pasó
→ Click en "Enviar"
```

**Opción 2: Email directo**
```
Para: soporte@transformafacil.com
Asunto: [URGENT] Problema en X

Cuerpo:
Hola,

Soy [tu nombre] de [operador].
Problema: [describe el problema]
Cuándo sucedió: [fecha/hora]
Ya probé: [lista de lo que probaste]

Gracias,
[nombre]
```

**Opción 3: Portal de Soporte**
```
1. Ve a: https://support.transformafacil.com
2. Click en "Crear ticket"
3. Rellena el formulario
4. Click en "Enviar"
5. Recibirás número de ticket
6. Puedes trackear el progreso
```

### Preguntas Frecuentes (FAQ)

**P: ¿Cuánto tiempo tarda la sincronización STM?**
R: La sincronización automática corre a las 00:30 UTC cada día. Toma ~30 minutos para procesar todas las líneas.

**P: ¿Puedo ver datos de otros operadores?**
R: No, cada operador solo ve su propia información y la de competidores como datos públicos.

**P: ¿Qué pasa si cambio un horario pero no lo implemento realmente?**
R: El simulador es solo para analizar. Los cambios reales deben ser comunicados a STM. El dashboard no afecta la operación real.

**P: ¿Cuánto tiempo de antecedencia debo cambiar horarios?**
R: STM requiere notificación con 48 horas de antecedencia mínimo. Hazlo lo antes posible.

**P: ¿Cómo se calcula el impacto estimado?**
R: Usamos historial de 6 meses + machine learning. Precisión: ~80%. Cambios reales pueden variar.

**P: ¿Puedo usar esto en mi celular?**
R: Sí, el sistema es responsive. Abre en navegador de celular (Chrome, Safari, Firefox).

---

## 📚 RECURSOS ADICIONALES

### Videos Tutoriales
- "Primer acceso al dashboard" (3 min)
- "Cómo usar el simulador" (5 min)
- "Entender alertas de competencia" (4 min)
- "Generar reportes" (3 min)

Disponibles en: https://learning.transformafacil.com/videos

### Webinars
- **Mensual:** "Casos de éxito" - Últimas tendencias
- **Quincenal:** "Q&A en vivo" - Preguntas con el equipo
- **Semanal:** "Nuevas features" - Lo que viene

Inscribirse: https://learning.transformafacil.com/webinars

### Documentación Técnica
Para administradores y desarrolladores:
- API Reference
- Integración con sistemas propios
- Exportación automática de datos

Disponible en: https://docs.transformafacil.com

---

## 📋 CHECKLIST RÁPIDO

### Primer Día
- [ ] Accediste exitosamente
- [ ] Comprendiste los KPIs
- [ ] Viste tu salud operacional
- [ ] Exploraste las 4 tabs

### Primera Semana
- [ ] Entendiste análisis de competencia
- [ ] Abriste el simulador (sin cambios reales)
- [ ] Viste cómo se generan reportes
- [ ] Reportaste cualquier problema

### Primer Mes
- [ ] Respondiste a al menos 1 alerta de competencia
- [ ] Implementaste 1 cambio recomendado
- [ ] Generaste 2+ reportes
- [ ] Compartiste insights con tu equipo

---

**Versión del Manual:** 2.0.0
**Fecha de publicación:** Marzo 2026
**Próxima actualización:** Junio 2026

Para sugerencias sobre este manual:
📧 docs@transformafacil.com

---

¡Gracias por usar TransformaFacil 2.0!
