# Stub Cloud Function `immOAuthCallback` — encargo a Code

**Estado:** Jonathan registró el cliente OAuth en el portal de la IMM con URL de Redirección apuntando a `https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback`. Cowork verificó con `curl` que la URL devuelve **HTTP 404** (la Cloud Function no existe).

**Prioridad:** media. **No bloquea el Sprint Lunes** (BRIDGE-012). Code lo agarra cuando termine los 8 ítems de ese sprint, o entre commits si sobra tiempo.

**Deadline:** antes del lunes 4 mayo 9:00 AM.

---

## Por qué hay que crear el stub

1. Si el ingeniero gerente general CUTCSA durante la demo abre la URL en el navegador, devolver 404 queda mal.
2. Si la IMM hace un health check posterior al alta del cliente OAuth, un 404 podría desactivar el cliente.
3. La integración OAuth real (canje de `code` por `access_token`, refresh tokens, llamadas a la API IMM, ingest de datos enriquecidos) es **feature post-lunes**, requiere planificación propia. **Este stub NO la implementa**, solo asegura que la URL responda 200 con HTML válido.

## Política aplicada

- Cero mocks que pasen por reales: el stub **no canjea** el code por token, no llama a la API, no procesa OAuth de verdad. Solo responde "Autorización recibida".
- No-regresión §11: no toca código existente. Solo agrega un export nuevo.
- No es archivo crítico compartido §10: es archivo nuevo en `functions/src/`.

---

## Implementación

### Archivo nuevo: `functions/src/immOAuthCallback.ts`

```typescript
import { onRequest } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';

/**
 * OAuth callback receiver para el cliente registrado ante la IMM.
 *
 * STUB pre-lunes 4 mayo 2026: devuelve 200 OK con HTML para que la URL
 * de Redirección registrada en el portal IMM no devuelva 404. NO procesa
 * el flujo OAuth real (eso es feature post-lunes con su propio plan).
 *
 * Cuando se implemente el canje real:
 *  - leer Client Secret desde Firebase Functions Config (NO hardcodear)
 *  - POST a token endpoint de IMM con grant_type=authorization_code
 *  - guardar access_token + refresh_token en Firestore con TTL
 *  - redirigir al frontend con flag de "integración IMM activa"
 */
export const immOAuthCallback = onRequest(
  { region: 'us-central1', cors: false },
  (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    const error = typeof req.query.error === 'string' ? req.query.error : null;

    // Log seguro: nunca persistir el code real, solo flag de presencia.
    logger.info('[IMM OAuth Callback]', {
      codePresent: !!code,
      state: state ?? null,
      error: error ?? null,
    });

    if (error) {
      res.status(400).send(buildHtml({
        title: 'Autorización denegada',
        heading: 'No se completó la autorización',
        message: `La IMM rechazó la autorización: ${escapeHtml(error)}.`,
        ok: false,
      }));
      return;
    }

    res.status(200).send(buildHtml({
      title: 'SkillRoute · IMM Autorizado',
      heading: 'Autorización recibida',
      message: 'SkillRoute recibió correctamente la autorización de la IMM. Podés cerrar esta ventana.',
      ok: true,
    }));
  }
);

interface HtmlOpts {
  title: string;
  heading: string;
  message: string;
  ok: boolean;
}

function buildHtml({ title, heading, message, ok }: HtmlOpts): string {
  const accent = ok ? '#10b981' : '#ef4444';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; background: #0f172a;
           color: #e2e8f0; margin: 0; min-height: 100vh; display: flex;
           align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 480px; background: #1e293b; border: 1px solid #334155;
            border-radius: 12px; padding: 40px; text-align: center; }
    .badge { display: inline-block; width: 56px; height: 56px; line-height: 56px;
             border-radius: 50%; background: ${accent}; color: white;
             font-size: 28px; margin-bottom: 16px; }
    h1 { color: #f1f5f9; margin: 0 0 16px; font-size: 22px; }
    p { color: #cbd5e1; margin: 0; line-height: 1.55; }
    .brand { margin-top: 28px; color: #64748b; font-size: 13px; letter-spacing: 0.5px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">${ok ? '✓' : '!'}</div>
    <h1>${escapeHtml(heading)}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="brand">SkillRoute · Inteligencia metropolitana</div>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### Edit: `functions/src/index.ts`

Agregar al final del archivo (NO modificar exports existentes):

```typescript
export { immOAuthCallback } from './immOAuthCallback';
```

⚠️ `functions/src/index.ts` está en lista de archivos críticos §10 — Code lo edita en Windows nativo, Cowork no.

### Deploy

```bash
cd functions
npm run build
firebase deploy --only functions:immOAuthCallback
```

### Verificación

```bash
curl -i https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback
```

**Esperado:**
- `HTTP/2 200`
- `content-type: text/html; charset=utf-8`
- Body contiene "Autorización recibida" y "SkillRoute".

```bash
curl -i "https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback?error=access_denied"
```

**Esperado:**
- `HTTP/2 400`
- Body con "Autorización denegada" y `access_denied`.

Cowork repite estos curl post-deploy y reporta DONE.

---

## Mensaje de commit sugerido

```
feat(imm): stub Cloud Function immOAuthCallback para flujo OAuth IMM

URL de Redirección registrada en portal OAuth de la IMM
(https://us-central1-ucot-gestor-cloud.cloudfunctions.net/immOAuthCallback)
necesita responder 200 OK antes del lunes 4 mayo (presentación CUTCSA).

Stub minimal:
- recibe ?code=&state=&error= del callback OAuth IMM
- responde HTML con branding SkillRoute (200 OK / 400 si error)
- log seguro (no persiste el code, solo flag de presencia)
- NO canjea code por access_token (feature post-lunes con su propio plan)

Sin riesgo de regresión: archivo nuevo, único cambio en index.ts es
agregar export. No toca rutas, reglas Firestore ni servicios existentes.
```

---

## Backlog post-lunes (NO hacer ahora)

Cuando se aborde la integración real:

1. Endpoint `/api/imm/login` que genera `state` random y redirige al authorize endpoint de IMM.
2. En `immOAuthCallback`, canjear `code` por `access_token` con `client_secret` desde Functions Config (`firebase functions:config:set imm.client_secret=...`).
3. Persistir tokens en Firestore con regla de acceso solo backend.
4. Refresh automático antes de expiración.
5. Servicio nuevo `immApiService.ts` que use el access_token para llamar a la API.
6. Integración al ingest existente: si el feed IMM oficial tiene datos que el endpoint público `stm-online` no tiene, enriquecer la colección `competidores` o equivalente.
7. UI: badge en `/admin/sistema` "Integración IMM: activa / pendiente / token caducado".

Toda esa parte requiere su propio diseño, sus propios tests, y su propia carta de no-regresión. **No mezclar con el stub.**
