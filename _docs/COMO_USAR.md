# TransformaFacil 2.0 – Listo para usar

**Panel original** (el de https://ucot-gestor-cloud.web.app) restaurado desde el historial del repo.

**Ver direcciones web listas:** [ENTRADA_Y_URLS.md](ENTRADA_Y_URLS.md)

## Entrada directa (recomendado)

1. **Doble clic en `INICIAR.bat`**  
   O en la raíz del proyecto ejecute:

   ```bash
   npm start
   ```

2. La primera vez se instalarán las dependencias. Luego se abrirá el navegador en la app.

3. **Iniciar sesión:** usuario `329`, contraseña `admin123` (SuperAdmin) → **Ingresar**.

4. Tras el login irás al dashboard. Para **Ingestion de datos** (como en producción): menú **Admin** → **Ingestion**, o directo:  
   **http://localhost:5173/dashboard/admin/ingestion**

---

## Requisitos

- **Node.js** 18 o superior (recomendado 20+)
- **npm** (viene con Node)

---

## Otras órdenes

| Comando          | Descripción                                            |
| ---------------- | ------------------------------------------------------ |
| `npm start`      | Instala si hace falta, arranca app y abre el navegador |
| `npm run dev`    | Arranca backend + frontend (sin abrir navegador)       |
| `npm run build`  | Compila frontend + backend para producción             |
| `npm run deploy` | Despliega en Firebase (si está configurado)            |

---

## Estructura

- **frontend/** – Panel original (Vite + React): Login, Dashboard, Tránsito, Admin (Ingestion, Usuarios, RRHH, etc.), Flota, Inspectores, etc.
- **backend/** – API Express. Health y login (puerto 3001). En desarrollo el frontend hace proxy `/api` → backend.
- **INICIAR.bat** – Entrada directa en Windows (doble clic).
