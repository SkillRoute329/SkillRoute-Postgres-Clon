# 🚀 DEPLOY EN WINDOWS - PASO A PASO

## 📋 REQUISITOS

- ✅ Node.js 20+ instalado
- ✅ Carpeta TransformaFacil-2.0
- ✅ Acceso a Google Chrome o navegador
- ✅ Permiso administrativo (puede ser necesario)

---

## 🎯 PASO 1: Abrir Terminal (PowerShell o CMD)

### Opción A: PowerShell (Recomendado)
1. Abre el menú Inicio
2. Busca "PowerShell"
3. Click derecho → "Ejecutar como administrador"

### Opción B: CMD
1. Abre el menú Inicio
2. Busca "cmd" o "Símbolo del sistema"
3. Click derecho → "Ejecutar como administrador"

---

## 🎯 PASO 2: Navegar a la Carpeta del Proyecto

```powershell
cd C:\ruta\a\TransformaFacil-2.0
```

**Reemplaza `C:\ruta\a\` con la ruta real de tu proyecto.**

Verifica que estés en el lugar correcto:
```powershell
ls  # o dir (en CMD)
```

Debe mostrar archivos como: `firebase.json`, `DEPLOY.bat`, etc.

---

## 🔐 PASO 3: Autenticar con Firebase

```powershell
npx firebase-tools@latest login
```

**Esto:**
1. Descarga Firebase Tools (primera vez: 1-2 minutos)
2. Abre tu navegador automáticamente
3. Pide confirmar tu cuenta Google

**EN EL NAVEGADOR:**
- Inicia sesión con tu cuenta Google
- Haz click en "Permitir" para dar acceso
- Espera el mensaje "Login successful"
- Regresa a PowerShell/CMD

---

## 📦 PASO 4: Seleccionar Proyecto

```powershell
npx firebase-tools@latest use ucot-gestor-cloud
```

Debe mostrar:
```
Now using project ucot-gestor-cloud
```

---

## 🌐 PASO 5: DEPLOY COMPLETO

```powershell
npx firebase-tools@latest deploy
```

**Esto hará:**
- Deploy de Frontend (Hosting)
- Deploy de Backend (Cloud Functions)
- Deploy de Firestore Rules
- Deploy de Indexes

**Espera 3-10 minutos** (depende de conexión).

**Debes ver al final:**
```
✔  Deploy complete!
```

---

## ✓ PASO 6: VERIFICAR DEPLOY

Abre en tu navegador:
```
https://ucot-gestor-cloud.web.app/dashboard/traffic/agents
```

**Verifica:**
- ✅ La página carga sin errores
- ✅ Los agentes aparecen en la interfaz
- ✅ Las nuevas características se ven
- ✅ No hay errores rojos en consola (F12)

---

## 🆘 TROUBLESHOOTING

### Error: "firebase: command not found"
**Solución:** Usa `npx` al inicio:
```powershell
npx firebase-tools@latest deploy
```

### Error: "No project selected"
**Solución:** Ejecuta:
```powershell
npx firebase-tools@latest use ucot-gestor-cloud
```

### Error: "Not authenticated"
**Solución:** Ejecuta el login nuevamente:
```powershell
npx firebase-tools@latest login
```

### El navegador no abre
**Solución:**
1. Abre manualmente: https://accounts.google.com/o/oauth2/v2/auth?...
2. O usa: `npx firebase-tools@latest login --no-localhost`

### Los cambios no se ven
**Solución:**
1. Limpia cache: `Ctrl+Shift+Delete`
2. Abre en incógnito/privado
3. Espera 5 minutos (CDN)
4. Recarga la página

---

## 📊 TIEMPOS ESTIMADOS

| Paso | Tiempo |
|------|--------|
| Descarga Firebase Tools | 1-2 min |
| Login (primera vez) | 2-3 min |
| Deploy | 3-10 min |
| Propagación CDN | 2-5 min |
| **TOTAL** | **~15 min** |

---

## ✨ COMANDOS RÁPIDOS

**Si algo falla y quieres reintentar:**

```powershell
# 1. Verificar que estás autenticado
npx firebase-tools@latest status

# 2. Ver proyecto actual
npx firebase-tools@latest projects:list

# 3. Cambiar de proyecto
npx firebase-tools@latest use ucot-gestor-cloud

# 4. Deploy solo Hosting (más rápido)
npx firebase-tools@latest deploy --only hosting

# 5. Ver logs
npx firebase-tools@latest functions:log
```

---

## 🎉 ¡LISTO!

Una vez que veas "Deploy complete!", tus cambios estarán **VIVOS** en:
- 🌐 https://ucot-gestor-cloud.web.app

Los usuarios verán las nuevas características de agentes inmediatamente.

---

## 📞 SOPORTE

Si necesitas ayuda:
1. Verifica que Node.js está instalado: `node --version`
2. Verifica npm: `npm --version`
3. Revisa los logs: `npx firebase-tools@latest functions:log`
4. Contacta: jonathanlaluz@gmail.com

**Documentos relacionados:**
- RESUMEN_CAMBIOS.md
- GUIA_DEPLOY.md
