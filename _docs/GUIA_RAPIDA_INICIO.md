# 🚀 GUÍA RÁPIDA DE INICIO - TransformaFacil 2.0

## ¿QUÉ ES?
TransformaFacil 2.0 es un **Centro de Comando Unificado (CCU)** para operaciones de transporte urbano.
- Gestión de flotas
- Control de inspectores
- Venta de boletos
- Datos en tiempo real
- Análisis operacional

---

## 1️⃣ REQUERIMIENTOS PREVIOS

```bash
# Verificar que tengas instalado:
node --version          # v20+
npm --version          # v10+
git --version
```

Si falta alguno, instala desde https://nodejs.org

---

## 2️⃣ CLONAR Y PREPARAR (Primera vez)

```bash
# Ir a la carpeta del proyecto
cd /sesiones/tu-ruta/TransformaFacil-2.0

# Instalar todas las dependencias
npm run install:all

# Configurar Firebase (si aún no está)
# - Crear proyecto en https://console.firebase.google.com
# - Copiar config en frontend/src/config/firebase.ts
# - Crear archivo .env en backend/
```

---

## 3️⃣ EJECUTAR EN MODO DESARROLLO (Recomendado)

**Opción A: Automático con start-app.bat (Windows)**
```bash
# Solo haz doble-clic en: start-app.bat
# Se abrirán 2 ventanas automáticamente
```

**Opción B: Manual en Terminal**
```bash
# Terminal 1 - Backend
cd backend
npm run dev
# Verás: 🛡️ TRANSFORMAFACIL API corriendo en http://0.0.0.0:3002

# Terminal 2 - Frontend (nueva terminal)
cd frontend
npm run dev
# Verás: Local: http://localhost:5173/
```

**Resultado:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3002
- Diagnóstico: http://localhost:3002/api/doctor

---

## 4️⃣ LOGIN INICIAL

Usar estas credenciales de prueba:
```
Interno: 329
Contraseña: (según tu Firebase/backend)
```

O crea un usuario en Firebase Console > Authentication

---

## 5️⃣ PRIMER RECORRIDO

Una vez dentro:

1. **Dashboard** ← Verás estado del turno, notificaciones
2. **Matriz de Servicio** ← Ver líneas disponibles
3. **Control Inspectores** ← Monitoreo de actividad
4. **Sistema de Boletos** ← Venta (en desarrollo)

---

## 6️⃣ BUILD PARA PRODUCCIÓN

```bash
# Generar build optimizado
npm run build

# Vista previa (como si fuera producción)
npm run preview

# Desplegar en Firebase
npm run deploy
```

Verás URL: https://tu-proyecto.web.app

---

## 7️⃣ SOLUCIÓN DE PROBLEMAS

### ❌ Puerto 5173 ya en uso
```bash
npm run dev -- --port 5174
```

### ❌ Error "Cannot find module 'firebase'"
```bash
cd frontend && npm install
cd ../backend && npm install
```

### ❌ "Build error: TS2769"
```bash
# Probablemente errores de tipos. Verificar:
cd frontend
npm run build
# Te mostrará exactamente qué está mal
```

### ❌ Backend no responde
```bash
# Verificar que Firebase está configurado
curl http://localhost:3002/api/health
# Debe responder: {"ok":true,"version":"2.0.1"}
```

---

## 8️⃣ ESTRUCTURA DEL PROYECTO

```
TransformaFacil-2.0/
├── frontend/                    # React + Vite
│   ├── src/
│   │   ├── pages/              # Páginas principales
│   │   ├── components/         # Componentes reutilizables
│   │   ├── services/           # Lógica de API/Firebase
│   │   └── context/            # Estado global
│   └── package.json
│
├── backend/                     # Express + TypeScript
│   ├── src/
│   │   ├── index.ts           # API principal
│   │   └── config/            # Configuración Firebase
│   └── package.json
│
├── docker-compose.yml          # PostgreSQL (opcional)
├── .firebaserc                 # Config Firebase
└── ANALISIS_TECNICO_COMPLETO.docx  # Tu análisis completo
```

---

## 9️⃣ PRÓXIMOS PASOS (PLAN 12 SEMANAS)

| Semana | Objetivo | Prioridad |
|--------|----------|-----------|
| 1-2 | Refactorizar backend (modularizar) | 🔴 Crítica |
| 3-4 | Sistema de datos en tiempo real (Socket.io) | 🔴 Crítica |
| 5-6 | Completar sistema de venta de boletos | 🟠 Alta |
| 7-8 | Mejora de procesos operacionales | 🟠 Alta |
| 9-10 | Análisis y reportes (BI) | 🟡 Media |
| 11-12 | Testing, deploy, documentación | 🟡 Media |

---

## 🔟 DOCUMENTACIÓN COMPLETA

📄 **Leer**: `ANALISIS_TECNICO_COMPLETO.docx`
Este documento contiene:
- Análisis detallado de arquitectura
- Problemas identificados
- Plan completo de implementación
- Roadmap futuro
- Recomendaciones técnicas

---

## 1️⃣1️⃣ CONTACTO Y SOPORTE

**Para reportar bugs o cambios:**
1. Abre issue en GitHub (si existe repo)
2. Describe el problema claramente
3. Incluye logs de consola
4. Especifica qué pasos lo reproducen

**Variables de entorno (.env requerido):**
```
PORT=3002
NODE_ENV=development
JWT_SECRET=tu-secret-aqui
FIREBASE_PROJECT_ID=tu-proyecto
```

---

## 1️⃣2️⃣ CHECKLIST DE VERIFICACIÓN

Antes de reportar que "no funciona", verifica:

- [ ] Node v20+ instalado
- [ ] `npm install` completado
- [ ] Backend corriendo en 3002
- [ ] Frontend corriendo en 5173
- [ ] No hay puertos en conflicto
- [ ] Firebase está configurado (.env con credenciales)
- [ ] Consola del navegador sin errores (F12 > Console)
- [ ] No hay firewall bloqueando puertos
- [ ] Intentaste ctrl+c y reiniciaste

---

## 🎯 OBJETIVO FINAL

En 12 semanas, TransformaFacil debe ser:
✅ Centro operativo con datos en tiempo real
✅ Venta de boletos integrada y funcionando
✅ Dashboard de gerencia con KPIs
✅ Reportes automáticos diarios
✅ Altamente escalable (multitenant)

---

**Última actualización**: Marzo 2026
**Versión**: 2.0.1
**Estado**: En Desarrollo Activo
