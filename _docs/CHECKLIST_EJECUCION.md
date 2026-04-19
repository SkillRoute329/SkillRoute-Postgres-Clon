# ✅ CHECKLIST DE EJECUCIÓN
**Sistema:** TransformaFacil 2.0 - Módulos Agents & Intelligence
**Responsable:** Jonathan Laluz
**Fecha:** Abril 2026

---

## 🎯 OBJETIVO
Poner en marcha los módulos de Agentes Digitales e Inteligencia Competitiva para evaluar competencia en tiempo real.

---

## 📋 PRE-REQUISITOS (Verificar primero)

- [ ] **Node.js >= 18 instalado**
  ```bash
  node --version  # Debe mostrar v18+
  ```

- [ ] **npm instalado**
  ```bash
  npm --version
  ```

- [ ] **Acceso a carpeta del proyecto**
  ```bash
  cd /ruta/al/proyecto/TransformaFacil-2.0
  ```

- [ ] **Puerto 3099 disponible**
  ```bash
  lsof -i :3099  # No debe retornar nada
  ```

- [ ] **Puerto 3002 disponible**
  ```bash
  lsof -i :3002  # No debe retornar nada
  ```

- [ ] **Puerto 5173 disponible (frontend)**
  ```bash
  lsof -i :5173  # No debe retornar nada
  ```

---

## 🚀 EJECUCIÓN (3 FASES)

### FASE 1: Setup Inicial (5 minutos)

#### Paso 1.1: Instalar dependencias Backend
```bash
cd backend
npm install
```
**Status:** ✅ Completado / ❌ Fallo

- [ ] No hay errores en npm install
- [ ] node_modules creada

#### Paso 1.2: Verificar Backend puede iniciar
```bash
npm run dev
```
**Status:** ✅ Completado / ❌ Fallo

- [ ] Backend inicia en puerto 3002
- [ ] Log: "✅ Backend escuchando en http://localhost:3002"
- [ ] Presionar Ctrl+C para detener

#### Paso 1.3: Instalar dependencias Frontend
```bash
cd frontend
npm install
```
**Status:** ✅ Completado / ❌ Fallo

- [ ] No hay errores en npm install
- [ ] node_modules creada en frontend

---

### FASE 2: Iniciar Servidor + Bridge (10 minutos)

**⚠️ IMPORTANTE: Necesitas 2 terminales simultáneamente**

#### Paso 2.1: Terminal 1 - Backend Principal
```bash
cd /ruta/proyecto/backend
npm run dev
```
**Status:** ✅ Ejecutando / ❌ Error

Deberías ver en la terminal:
```
🚀 TransformaFacil Backend iniciando...
✅ Backend escuchando en http://localhost:3002
```

- [ ] Terminal no cierra automáticamente
- [ ] Backend responde en http://localhost:3002/health
  ```bash
  # En otra terminal:
  curl http://localhost:3002/health
  # Debe retornar: {"ok":true}
  ```

#### Paso 2.2: Terminal 2 - Bridge Server
**Abre una NUEVA terminal** (no cerrar Terminal 1)

```bash
cd /ruta/proyecto/backend
npm run bridge
```
**Status:** ✅ Ejecutando / ❌ Error

Deberías ver:
```
✅ Bridge Server escuchando en http://localhost:3099
   - GET  /health
   - GET  /api/lines/ucot
   - GET  /api/analysis/:linea
```

- [ ] Terminal no cierra automáticamente
- [ ] Bridge responde en http://localhost:3099/health
  ```bash
  # En tercera terminal:
  curl http://localhost:3099/health
  # Debe retornar: {"ok":true,"message":"Bridge Server activo"}
  ```

#### Paso 2.3: Verificar Conexión Bridge → Backend
```bash
# En tercera terminal:
curl http://localhost:3099/api/lines/ucot
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "totalLineas": 2,
  "totalBuses": 14,
  "lineas": [
    {"linea": "17", "cantidad": 8, ...},
    {"linea": "71", "cantidad": 6, ...}
  ]
}
```

- [ ] Respuesta contiene línea 17
- [ ] Respuesta contiene línea 71
- [ ] Ambas tienen buses listados

---

### FASE 3: Frontend (5 minutos)

#### Paso 3.1: Terminal 3 - Iniciar Frontend
**Abre una TERCERA terminal nueva**

```bash
cd /ruta/proyecto/frontend
npm run dev
```

**Status:** ✅ Ejecutando / ❌ Error

Deberías ver:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

- [ ] Frontend inicia sin errores
- [ ] Devtools muestra servidor en http://localhost:5173

#### Paso 3.2: Acceder a Módulo Intelligence
Abre en tu navegador:
```
http://localhost:5173/dashboard/traffic/intelligence
```

**Status:** ✅ Cargó / ❌ Error

Deberías ver:
- [ ] Página se carga sin errores
- [ ] Muestra "Línea 17" y "Línea 71"
- [ ] Cada línea muestra cantidad de buses
- [ ] Hay barras de progreso de competencia

#### Paso 3.3: Acceder a Módulo Agents
Abre en tu navegador:
```
http://localhost:5173/dashboard/traffic/agents
```

**Status:** ✅ Cargó / ❌ Error

Deberías ver:
- [ ] Página se carga sin errores
- [ ] Lista de líneas (17, 71)
- [ ] Servicios activos por línea
- [ ] Estado de competencia
- [ ] Recomendaciones tácticas

---

## 🧪 VALIDACIÓN DE FUNCIONALIDAD

### Test 1: Inteligencia Competitiva
En navegador, abre DevTools (F12) → Console

Ejecuta:
```javascript
fetch('http://localhost:3099/api/analysis/17')
  .then(r => r.json())
  .then(d => console.log(d))
```

**Status:** ✅ Funciona / ❌ Error

Deberías ver:
```json
{
  "ok": true,
  "linea": "17",
  "resumen": {
    "nivelAlerta": "MEDIA",
    "pctFlotaEnDisputa": 62,
    ...
  },
  "alertas": [...]
}
```

- [ ] Respuesta contiene "ok": true
- [ ] Tiene alertas
- [ ] Tiene recomendaciones

### Test 2: Cambiar a Línea 71
En navegador, en Dashboard Inteligencia:
1. Haz click en "Línea 71"
2. Espera a que cargue

**Status:** ✅ Funciona / ❌ Error

- [ ] Muestra datos de línea 71
- [ ] Porcentaje de competencia diferente a línea 17
- [ ] Alertas específicas de línea 71

### Test 3: Datos en Tiempo Real
En Dashboard Agents:
1. Abre línea 17
2. Actualiza página (F5)

**Status:** ✅ Funciona / ❌ Error

- [ ] Los datos persisten
- [ ] No hay errores en consola
- [ ] Recomendaciones se muestran correctamente

---

## 🎯 ESTADO FINAL

Una vez completados todos los pasos:

```
✅ Backend corriendo en http://localhost:3002
✅ Bridge Server corriendo en http://localhost:3099
✅ Frontend corriendo en http://localhost:5173
✅ Módulo Agents mostrando datos
✅ Módulo Intelligence mostrando datos
✅ Competencia siendo evaluada automáticamente
```

---

## 🔴 TROUBLESHOOTING

### Problema: "Bridge Server no responde"
```
Solución:
1. Terminal 2 debe mostrar "Bridge Server escuchando en 3099"
2. Si no: Presionar Ctrl+C en Terminal 2 y reintentar
3. Verificar: curl http://localhost:3099/health
```

### Problema: "Backend no responde"
```
Solución:
1. Terminal 1 debe mostrar "Backend escuchando en 3002"
2. Si no: Presionar Ctrl+C en Terminal 1 y reintentar
3. Verificar: curl http://localhost:3002/health
```

### Problema: "Frontend muestra pantalla en blanco"
```
Solución:
1. Abrir DevTools (F12) → Console
2. Buscar errores en rojo
3. Si dice "failed to fetch localhost:3099":
   - Verificar que Bridge está activo (Terminal 2)
   - Verificar puerto 3099: lsof -i :3099
```

### Problema: "Puerto ya en uso"
```bash
# Buscar qué está usando el puerto
lsof -i :3099  # para bridge
lsof -i :3002  # para backend

# Matar proceso (Linux/Mac)
kill -9 <PID>

# O usar diferente puerto (Windows):
npm run bridge -- --port 3100
```

### Problema: "npm install falla"
```bash
# Borrar node_modules y reintentar
rm -rf node_modules
npm install
```

---

## 📝 NOTAS IMPORTANTES

1. **Necesitas 3 terminales abiertas simultáneamente:**
   - Terminal 1: Backend (3002)
   - Terminal 2: Bridge (3099)
   - Terminal 3: Frontend (5173)

2. **No cerrar ninguna terminal durante la demo**

3. **Los datos son simulados ahora** (próxima: integrar STM API oficial)

4. **Documentación completa en:**
   - `/QUICK_START_AGENTS.md` - Guía rápida
   - `/RESOLUCION_AGENTS_INTELLIGENCE.md` - Detalles técnicos
   - `/DIAGNOSTICO_MODULOS_AGENTS_INTELLIGENCE.md` - Análisis

---

## ✅ FINALIZACIÓN

Una vez todo funcione:

1. **Captura screenshots:**
   - Módulo Inteligencia con línea 17
   - Módulo Agents con recomendaciones
   - DevTools mostrando datos del Bridge

2. **Prepara presentación:**
   - "Mi sistema detecta líneas rivales"
   - "Calcula competencia en tiempo real"
   - "Genera recomendaciones automáticas"

3. **Próximo paso:**
   - Integrar datos STM oficial
   - Agregar más líneas
   - Publicar en Metropolitano

---

**Fecha Inicio:** Abril 2026
**Estado:** Listo para ejecutar
**Tiempo Estimado:** 20 minutos
**Dificultad:** Baja (solo ejecutar comandos)

¡Adelante! 🚀
