# TransformaFacil 2.0 – Producto final – Direcciones listas para usar

## Cómo poner en marcha la aplicación

**Una sola acción:**

- **Windows:** doble clic en **`INICIAR.bat`**
- **O en terminal:** ejecutar **`npm start`**

Espera unos segundos hasta que se abra el navegador. Si no se abre, usa las direcciones siguientes.

---

## Direcciones web listas para usar

| Uso                                              | URL                                                 |
| ------------------------------------------------ | --------------------------------------------------- |
| **Aplicación (entrar directo)**                  | **http://localhost:5173**                           |
| **Panel Admin → Ingestion** (como en producción) | **http://localhost:5173/dashboard/admin/ingestion** |
| Comprobar API (health)                           | http://localhost:3001/api/health                    |
| Login (API)                                      | http://localhost:3001/api/auth/login (POST)         |

---

## Entrar a la aplicación

1. Abre en el navegador: **http://localhost:5173**
2. Inicia sesión con el único usuario (SuperAdmin):
   - **Usuario:** `329`
   - **Contraseña:** `admin123`
3. Pulsa **Ingresar** → accedes al dashboard.

---

## Comprobar que todo funciona

Con la app en marcha, en otra terminal ejecuta:

```bash
npm run verificar
```

Deberías ver "Todo correcto" y el recordatorio de entrar con 329 / admin123.

---

## Si cierras la aplicación

Vuelve a ejecutar **`INICIAR.bat`** o **`npm start`** y entra de nuevo en **http://localhost:5173**.
