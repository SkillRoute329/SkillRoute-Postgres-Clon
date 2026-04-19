# Credenciales – TransformaFacil 2.0

**SuperAdministrador (cuenta activa en Firebase Auth):**

| Usuario | Contraseña                    | Rol        |
| ------- | ----------------------------- | ---------- |
| `0000`  | _(tu contraseña de Firebase)_ | SuperAdmin |

> ℹ️ El usuario `0000` es el SUPERADMIN registrado en Firebase Authentication del proyecto `ucot-gestor-cloud`.

---

**Fallback local (cuando el backend Express está corriendo en puerto 3001):**

| Usuario | Contraseña | Rol        |
| ------- | ---------- | ---------- |
| `329`   | `admin123` | Admin Demo |

> El login intenta primero Firebase Auth; si falla, usa automáticamente el backend local Express.

---

**Para crear nuevos usuarios:** Ve a la [Consola de Firebase](https://console.firebase.google.com/project/ucot-gestor-cloud/authentication/users) y agrega el email con formato `{numero_interno}@ucot.internal`.
