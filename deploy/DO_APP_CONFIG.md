# Configuración de DigitalOcean App Platform

Para asegurar un despliegue exitoso, copia y pega EXACTAMENTE estos valores en la configuración de DigitalOcean.

## 1. Configuración de Recursos (Components)

Cuando DigitalOcean detecte tu repositorio, asegúrate de editar la configuración:

- **Source Directory:** `/` (Raíz, o déjalo por defecto si es `.`)
- **Type:** `Web Service`

## 2. Comandos de Construcción y Arranque

Es CRÍTICO usar estos comandos para que funcionen tanto el Frontend como el Backend.

| Configuración | Valor (Copiar y Pegar) |
| :--- | :--- |
| **Build Command** | `npm run install:all && npm run build` |
| **Start Command** | `npm start` |

> *Nota: "install:all" se encarga de instalar dependencias en backend y frontend.*

## 3. Variables de Entorno (Environment Variables)

Debes agregar estas variables en la sección "Environment Variables".

| Key (Clave) | Value (Valor) | Tipo |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Texto plano |
| `DATABASE_URL` | *(Tu cadena de conexión a Postgres)* | Secret (Encrypt) |
| `JWT_SECRET` | *(Un password largo y seguro)* | Secret (Encrypt) |

## 4. Base de Datos

Si usas la base de datos gestionada de DigitalOcean:
1. Crea la Database en el mismo proceso.
2. DigitalOcean inyectará automáticamente `DATABASE_URL` si "attach" la base de datos.
3. Si la creaste por separado, copia la "Connection String" y ponla manualmente en las variables.

---

## 5. Verificación Final

Una vez desplegado:
1. Entra a "Activity" y espera el check verde ✅ "Deployed successfully".
2. Copia la URL pública (ej. `https://mi-app-xyz.ondigitalocean.app`).
3. Ejecuta en tu terminal local:

\`\`\`bash
npm run deploy:verify https://tu-app-real.ondigitalocean.app
\`\`\`
