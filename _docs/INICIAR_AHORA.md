# 🚀 INICIAR TRANSFORMAFACIL 2.0 - AHORA MISMO

**Estado:** ✅ TODO LISTO
**Fecha:** Abril 2026
**Próximo paso:** Ejecuta los comandos abajo

---

## ⚡ INICIO RÁPIDO (5 MINUTOS)

### OPCIÓN 1: LOCAL (DESARROLLO - Recomendado)

**PASO 1: Abre 3 terminales NUEVAS en la carpeta raíz del proyecto**

```bash
cd /ruta/a/TransformaFacil-2.0
```

**PASO 2: En TERMINAL 1 - Ejecuta Backend**

```bash
cd backend
npm run dev
```

**Esperas a ver:**
```
✅ TransformaFacil Backend iniciando...
✅ Backend escuchando en http://localhost:3002
```

**PASO 3: En TERMINAL 2 - Ejecuta Bridge Server**

```bash
cd backend
npm run bridge
```

**Esperas a ver:**
```
✅ Bridge Server escuchando en http://localhost:3099
   - GET  /health
   - GET  /api/lines/ucot
   - GET  /api/analysis/:linea
```

**PASO 4: En TERMINAL 3 - Ejecuta Frontend**

```bash
cd frontend
npm run dev
```

**Esperas a ver:**
```
VITE v5.x.x ready in xxx ms
➜ Local: http://localhost:5173/
```

**PASO 5: Abre en navegador**

```
http://localhost:5173
```

✅ **¡LISTO! Sistema corriendo localmente**

---

### OPCIÓN 2: DOCKER (TESTING)

**Una sola línea:**

```bash
docker-compose up -d
```

**Esperas 30 segundos y accedes:**

```
http://localhost:5173        # Frontend
http://localhost:3099        # Bridge
http://localhost:3002        # Backend
```

**Ver logs en tiempo real:**

```bash
docker-compose logs -f
```

**Detener:**

```bash
docker-compose down
```

---

### OPCIÓN 3: HEROKU (PRODUCCIÓN ONLINE)

**Ejecución automática:**

```bash
bash scripts/deploy-heroku.sh
```

**Luego en URLs live:**

```
https://transformafacil-web.herokuapp.com
https://transformafacil-bridge.herokuapp.com
https://transformafacil-api.herokuapp.com
```

---

## 🧪 VERIFICAR QUE TODO FUNCIONA

**Terminal 4 (nueva) - Ejecutar tests:**

```bash
bash backend/test-analisis-competencia.sh
```

**Resultado esperado:**
```
✅ TODOS LOS TESTS PASARON EXITOSAMENTE

FUNCIONALIDADES VERIFICADAS:
  ✅ Obtiene TODAS las líneas UCOT automáticamente
  ✅ Analiza FRECUENCIA (programada vs calculada)
  ✅ Calcula % de RECORRIDO COMPARTIDO
  ✅ Identifica SENTIDO de viaje (IDA/VUELTA)
  ✅ Genera matriz de competencia completa
```

---

## 🌐 URLS DISPONIBLES (LOCAL)

| Servicio | URL | Descripción |
|----------|-----|-------------|
| **Frontend** | http://localhost:5173 | Dashboard con UI |
| **Backend API** | http://localhost:3002 | API principal |
| **Bridge Server** | http://localhost:3099 | Procesador de datos |

---

## 📊 ENDPOINTS PRINCIPALES

### Health Check
```bash
curl http://localhost:3099/health
```
**Respuesta:** `{"ok":true,"message":"Bridge Server activo"}`

### Obtener líneas UCOT
```bash
curl http://localhost:3099/api/lines/ucot | jq '.totalLineas'
```
**Respuesta:** `3` (o más líneas)

### Análisis de línea 17
```bash
curl http://localhost:3099/api/analysis/17 | jq '.analisisFrequencia'
```
**Respuesta:** Frecuencia programada, calculada y desviación

### Análisis de todas las líneas
```bash
curl http://localhost:3099/api/all-analysis | jq '.totalLineas'
```

---

## 🎯 NAVEGACIÓN EN DASHBOARD

Una vez en http://localhost:5173:

1. **Dashboard Intelligence**
   - `/dashboard/traffic/intelligence`
   - Ver análisis de competencia por línea
   - Porcentaje de solapamiento
   - Alertas automáticas

2. **Dashboard Agents**
   - `/dashboard/traffic/agents`
   - Agentes digitales por línea
   - Recomendaciones tácticas
   - Evaluación de competencia

---

## ❌ TROUBLESHOOTING

### "Puerto ya en uso"
```bash
# Encuentra quién está usando el puerto
lsof -i :3002    # Backend
lsof -i :3099    # Bridge
lsof -i :5173    # Frontend

# Mata el proceso
kill -9 <PID>
```

### "Módulos no instalan"
```bash
cd backend
rm -rf node_modules package-lock.json
npm install

cd ../frontend
rm -rf node_modules package-lock.json
npm install
```

### "Backend/Bridge no inician"
```bash
# Verifica que npm run build completó sin errores
cd backend
npm run build

# Si hay errores, revisa:
cat backend/.env

# Debe tener credenciales de Firebase (opcional para tests)
```

### "Frontend no carga datos"
```bash
# Abre DevTools (F12) → Console
# Busca errores de conexión a localhost:3099

# Verifica que Bridge está activo:
curl http://localhost:3099/health
```

---

## 📋 ARQUITECTURA EN EJECUCIÓN

```
http://localhost:5173 (Frontend - Vite React)
        ↓
http://localhost:3099 (Bridge Server)
        ↓
http://localhost:3002 (Backend API)
        ↓
Datos públicos STM
```

---

## 🎓 PARA TU DEMOSTRACIÓN AL METROPOLITANO

**Con el sistema corriendo localmente, puedes:**

1. ✅ Mostrar análisis de competencia en tiempo real
2. ✅ Demostrar cálculo de frecuencia automático
3. ✅ Probar identificación de sentido de viaje
4. ✅ Ejecutar tests en vivo
5. ✅ Mostrar matriz completa de competencia

**Todo usando DATOS PÚBLICOS de STM** - Sin restricciones de acceso

---

## 📂 ARCHIVOS IMPORTANTES

```
TransformaFacil-2.0/
├── backend/
│   ├── npm run dev          ← Inicia Backend
│   └── npm run bridge       ← Inicia Bridge
├── frontend/
│   └── npm run dev          ← Inicia Frontend
├── docker-compose.yml       ← Para Docker
├── scripts/
│   └── deploy-heroku.sh     ← Para Heroku
└── SETUP_COMPLETO.md        ← Documentación completa
```

---

## 🚀 RESUMEN DE COMANDOS

```bash
# LOCAL - 3 terminales
Terminal 1: cd backend && npm run dev
Terminal 2: cd backend && npm run bridge
Terminal 3: cd frontend && npm run dev

# DOCKER
docker-compose up -d
docker-compose logs -f
docker-compose down

# HEROKU
bash scripts/deploy-heroku.sh

# TESTS
bash backend/test-analisis-competencia.sh
```

---

## ✅ CHECKLIST PRE-DEMOSTRACIÓN

- [ ] Backend ejecutándose (Terminal 1)
- [ ] Bridge ejecutándose (Terminal 2)
- [ ] Frontend ejecutándose (Terminal 3)
- [ ] Navegador abierto en http://localhost:5173
- [ ] Tests pasando (`bash backend/test-analisis-competencia.sh`)
- [ ] Dashboard cargando datos
- [ ] Análisis mostrando correctamente

---

## 🎉 ¡SISTEMA LISTO!

**Instrucciones resumidas:**

1. **LOCAL:** Abre 3 terminales, ejecuta `npm run dev` en backend, `npm run bridge` en backend, `npm run dev` en frontend
2. **DOCKER:** Ejecuta `docker-compose up -d`
3. **HEROKU:** Ejecuta `bash scripts/deploy-heroku.sh`

**URL para acceder:**
- Local: http://localhost:5173
- Docker: http://localhost:5173
- Online: https://transformafacil-web.herokuapp.com

---

**¿Necesitas ayuda? Lee DEPLOYMENT_GUIDE.md para detalles adicionales.**

🚀 **¡A disfrutar del sistema!**
