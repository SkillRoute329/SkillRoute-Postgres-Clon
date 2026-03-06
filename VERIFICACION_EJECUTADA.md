# Verificación ejecutada – Panel original

**Fecha:** 25 Feb 2026

## 1. Servidores arrancados

- **Backend:** http://localhost:3001 ✅
- **Frontend:** http://localhost:5176 ✅ (en esta ejecución; si 5173 está libre, Vite usará 5173)

## 2. Pruebas realizadas

| Prueba                                                 | Resultado                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Health del backend (GET /api/health)                   | ✅ OK                                                                            |
| Login 329 / admin123 en backend (POST /api/auth/login) | ✅ OK → SuperAdministrador, SuperAdmin                                           |
| Login vía proxy del frontend (5173)                    | ✅ OK → SuperAdmin                                                               |
| HTML del frontend (index)                              | ✅ Panel original: título "REBUILD FORZADO", manifest, main.tsx, emergency reset |
| Ruta /dashboard/admin/ingestion                        | ✅ SPA sirve la app (ruta manejada por React Router)                             |

## 3. Conclusión

- **Backend:** responde en 3001, health y login correctos.
- **Frontend:** es el **panel original** (index.html con REBUILD FORZADO, manifest, /src/main.tsx).
- **Credenciales:** 329 / admin123 → SuperAdmin.

## 4. Cómo comprobar en el navegador

1. Abre la URL que muestre la terminal del frontend (ej. **http://localhost:5173** o **http://localhost:5176**).
2. Deberías ver la pantalla de login del panel original (fondo imagen, campos usuario/contraseña, opciones avanzadas).
3. Entra con **329** / **admin123** → te llevará al dashboard con menú lateral (Admin, Flota, Operativa, etc.).
4. Ve a **Admin → Ingestion** o abre **http://localhost:XXXX/dashboard/admin/ingestion** (mismo XXXX que el paso 1) → pantalla de Ingestion de datos.

Si arrancas de nuevo con `npm start`, el frontend intentará usar el puerto 5173; si ya está ocupado, Vite mostrará otro (5174, 5175, etc.). Usa la URL que indique la terminal.
