# 🚀 INICIO RÁPIDO - TransformaFacil 2.0 en LOCAL

**Estado:** ✅ 100% LISTO PARA EJECUTAR

El sistema está completamente compilado y preparado. Solo necesitas ejecutar **2 comandos** en 2 terminales.

---

## 📋 REQUISITOS (Verificar ANTES de empezar)

```bash
# Terminal (ejecuta estos comandos):
node --version     # Debe ser v18+
npm --version      # Debe ser v9+
```

Si no los tienes, instala desde: https://nodejs.org/

---

## 🎯 OPCIÓN 1: MÁS RÁPIDO (Recomendado)

### Terminal 1 - Backend (Puerto 3000)

```bash
cd TransformaFacil-2.0/backend
npm start
```

Esperas a ver:
```
✅ Server running on port 3000
```

### Terminal 2 - Frontend (Puerto 3001)

```bash
cd TransformaFacil-2.0/frontend
npm install http-server -g  # Solo la primera vez
http-server dist -p 3001 -c-1
```

O simplemente:
```bash
cd TransformaFacil-2.0/frontend
npx serve dist -l 3001
```

---

## 🎯 OPCIÓN 2: CON UN CLICK (Más cómodo)

### Windows - Crear archivo `iniciar.bat`:

```batch
@echo off
cd /d %~dp0

echo Iniciando TransformaFacil 2.0...
echo.
echo Terminal 1 abierta: BACKEND
start cmd /k "cd backend && npm start"

timeout /t 3

echo Terminal 2 abierta: FRONTEND
start cmd /k "cd frontend && npx serve dist -l 3001"

echo.
echo ✅ Sistema iniciando...
echo Abre: http://localhost:3001
pause
```

Guarda como `iniciar.bat` en la carpeta principal, luego haz doble click.

### macOS/Linux - Crear archivo `iniciar.sh`:

```bash
#!/bin/bash
cd "$(dirname "$0")"

echo "🚀 Iniciando TransformaFacil 2.0..."
echo ""

# Terminal 1 - Backend
echo "Terminal 1: BACKEND"
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/backend && npm start"' &

sleep 3

# Terminal 2 - Frontend
echo "Terminal 2: FRONTEND"
osascript -e 'tell app "Terminal" to do script "cd '"$(pwd)"'/frontend && npx serve dist -l 3001"' &

echo ""
echo "✅ Sistema iniciando..."
echo "🌐 Abre: http://localhost:3001"
```

Guarda como `iniciar.sh`, luego:
```bash
chmod +x iniciar.sh
./iniciar.sh
```

---

## 🌐 ACCEDER AL SISTEMA

Una vez que ambas terminales estén corriendo:

**URL:** http://localhost:3001

**Credenciales de prueba:**
```
Número interno: 0001
Contraseña: test123
```

---

## ✅ CHECKLIST DE INICIO

- [ ] Node.js v18+ instalado
- [ ] npm v9+ instalado
- [ ] Carpeta TransformaFacil-2.0 en tu máquina
- [ ] Terminal 1: Backend iniciado (`npm start` en `/backend`)
- [ ] Terminal 2: Frontend iniciado (`serve dist -l 3001` en `/frontend`)
- [ ] Abriste http://localhost:3001 en navegador
- [ ] Viste la pantalla de LOGIN
- [ ] Ingresaste con usuario: 0001 / test123

---

## 🔍 SI ALGO FALLA

### "npm: comando no encontrado"
```bash
# Instala Node.js desde: https://nodejs.org/
```

### Puerto 3000 ya está en uso
```bash
# Backend - cambiar puerto
PORT=3002 npm start
# Luego en frontend, editar archivo para conectar a 3002
```

### Puerto 3001 ya está en uso
```bash
# Frontend - cambiar puerto
npx serve dist -l 3002
```

### "Cannot find module"
```bash
cd backend && npm install
cd ../frontend && npm install
```

---

## 📊 QUÉ ESTÁ CORRIENDO

| Componente | Puerto | URL |
|-----------|--------|-----|
| **Backend** | 3000 | http://localhost:3000 |
| **Frontend** | 3001 | http://localhost:3001 |
| **API** | 3000/api | http://localhost:3000/api/health |

---

## 🎓 PRIMEROS PASOS DESPUÉS DE LOGIN

1. **Dashboard Ejecutivo**
   - Ver KPIs principales
   - Estado de líneas
   - Alertas competitivas

2. **Análisis de Competencia**
   - Ver competidores detectados
   - Cambios de horarios en tiempo real

3. **Simulador de Horarios**
   - Simular 6 escenarios diferentes
   - Ver impacto estimado

4. **Reportes**
   - Generar reportes automáticos
   - Exportar a PDF/Excel

---

## 💡 PRÓXIMOS PASOS

### Después de probar localmente (Día 1-2):
1. Validar que todo funciona
2. Probar con datos reales
3. Preparar producción

### Para poner en PRODUCCIÓN (Día 3-4):
1. Leer: `INSTRUCCIONES_FINALES.md`
2. Configurar credenciales Firebase reales
3. Ejecutar: `firebase deploy`
4. Sistema estará ONLINE

---

## 📞 SOPORTE

Si algo no funciona:
1. Verifica Node.js versión: `node -v`
2. Verifica npm versión: `npm -v`
3. Lee los logs en las terminales
4. Consulta: `SEMANA_12_PRODUCTION_GUIDE.md`

---

## 🎉 ¡LISTO!

```
✅ Backend compilado y listo
✅ Frontend compilado y listo
✅ .env configurados
✅ Solo necesitas: 2 terminales + npm start
✅ Sistema 100% funcional en 30 segundos
```

**¿Necesitas ayuda?** Los comandos están listos arriba. ¡Solo copia y pega!

---

**Última actualización:** Marzo 13, 2026
**Estado:** ✅ LISTO PARA EJECUTAR
