# ¿Esta carpeta corresponde a ucot-gestor-cloud.web.app?

## Respuesta: **Sí, es el mismo proyecto**

- La URL **https://ucot-gestor-cloud.web.app** está referenciada en este repo:
  - `test-production.js` (hostname para login)
  - `GUIA_ACCESO_GLOBAL.md`
  - `backend_legacy/check-storage.ts` y `serviceAccountKey.json` (proyecto `ucot-gestor-cloud`)
- Firebase Hosting está configurado con `"public": "frontend/dist"` en `firebase.json`.
- La caché de despliegue en `.firebase/hosting.ZnJvbnRlbmRcZGlzdA.cache` corresponde a un build anterior que **sí** es el panel real: aparecen chunks como `DataIngestion-*.js`, `ServiceMatrix-*.js`, `UserManagement-*.js`, etc., que coinciden con la app desplegada.

Por tanto, **esta carpeta es la que despliega (o desplegó) en ucot-gestor-cloud.web.app**. No estamos en una carpeta equivocada.

---

## Dónde está el problema

El **código fuente** del frontend que generó ese panel (el que ves en producción con toda la funcionalidad) **no está en este repositorio**.

- En `frontend/` solo está el frontend **mínimo** que se añadió para que el proyecto pudiera arrancar (login + dashboard con menú y rutas básicas).
- El build que está en la caché de Firebase (DataIngestion, ServiceMatrix, etc.) se generó en su día a partir de **otro** frontend (otra estructura, otro build), pero ese código fuente no aparece en esta carpeta: ni en `frontend/src`, ni en otra ruta tipo `web/` o `app/`.

Por eso el panel que ves al ejecutar **aquí** (con `npm start`) no es idéntico al de **https://ucot-gestor-cloud.web.app/dashboard/admin/ingestion**: el de producción fue construido con un frontend del que no tenemos el código en este repo.

---

## Qué hacer a partir de aquí

1. **No desplegar a producción desde aquí** hasta tener claro qué quieres publicar:  
   Si ejecutas `npm run build` y `firebase deploy`, se subiría el frontend actual (el mínimo) y **sustituiría** el panel real que está ahora en ucot-gestor-cloud.web.app.

2. **Recuperar el frontend original** (recomendado si quieres el panel real en este repo):
   - Buscar en otro equipo, backup o repo donde esté el frontend que generaba los chunks `DataIngestion`, `ServiceMatrix`, etc.
   - Revisar otras ramas: `git branch -a` y buscar ramas con código de frontend completo.
   - Si tenías otro proyecto/clon (por ejemplo “TransForma Facil 2.1 (PWA Fix)” que menciona la web), copiar de ahí el frontend a esta carpeta.

3. **Seguir usando esta carpeta para**:
   - Backend y scripts que ya referencian ucot-gestor-cloud.
   - Probar localmente con el panel mínimo.
   - Cuando tengas el frontend original, sustituir `frontend/` por ese código y volver a construir y desplegar.

---

## Resumen

| Pregunta                                                        | Respuesta                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| ¿Esta carpeta es la de ucot-gestor-cloud.web.app?               | **Sí.**                                                                                           |
| ¿El panel que corre aquí es el mismo que en producción?         | **No.** El de producción se construyó con un frontend cuyo código no está en este repo.           |
| ¿Estamos perdiendo el tiempo en una carpeta que no corresponde? | **No.** Es la carpeta correcta; lo que falta es el **código fuente** del frontend del panel real. |
