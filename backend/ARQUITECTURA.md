# Arquitectura del Backend - TransformaFacil 2.0

## 📋 Visión General

El backend ha sido **refactorizado** desde un monolito de 376 líneas a una arquitectura **modular y escalable** con separación de responsabilidades.

### Stack
- **Framework:** Express.js
- **Lenguaje:** TypeScript
- **Base de datos:** Firebase Firestore
- **Autenticación:** JWT
- **Logging:** Winston
- **Estructura:** MVC (Controllers > Services > Models)

---

## 📁 Estructura de Carpetas

```
src/
├── config/              # Configuración
│   ├── firebase.ts      # Firebase initialization (existente)
│   ├── logger.ts        # Winston logger configuration
│   └── constants.ts     # Constantes globales
│
├── types/               # TypeScript interfaces
│   └── index.ts         # Todas las definiciones de tipos
│
├── middleware/          # Middlewares reutilizables
│   ├── auth.ts          # Autenticación y autorización
│   ├── errorHandler.ts  # Manejo centralizado de errores
│   └── validation.ts    # Validación de entrada
│
├── services/            # Lógica de negocio
│   ├── authService.ts   # Lógica de autenticación
│   ├── cartonService.ts # Lógica de cartones (servicios)
│   └── fleetService.ts  # Lógica de gestión de flota
│
├── controllers/         # Handlers de rutas
│   ├── authController.ts
│   ├── cartonController.ts
│   ├── fleetController.ts
│   └── systemController.ts
│
├── routes/              # Definición de rutas
│   └── index.ts         # Router principal
│
└── index.ts             # Bootstrap de la aplicación
```

---

## 🔄 Flujo de una Solicitud

```
Request
   ↓
Express Middleware (CORS, JSON parser, logging)
   ↓
Routes Matching (/api/...)
   ↓
Authentication Middleware (verifyAuth)
   ↓
Validation Middleware (validateBody)
   ↓
Controller Function
   ↓
Service Layer (lógica de negocio)
   ↓
Firebase Firestore
   ↓
Response JSON
   ↓
Error Handler (si hay error)
```

---

## 📚 Capas Explicadas

### 1. **Config** (Configuración)
- `logger.ts`: Winston logger - centraliza todos los logs
- `constants.ts`: Variables globales, nombres de collections, roles
- `firebase.ts`: Inicialización de Firebase (ya existía)

**Ventaja:** Cambios de configuración sin tocar lógica de negocio

### 2. **Types** (TypeScript)
Interfaz unificada para:
- `AuthUser`, `AuthRequest` (autenticación)
- `Vehicle`, `FleetCheck` (flota)
- `Carton` (servicios)
- `ApiResponse` (respuestas estándar)
- `AppError` (errores personalizados)

**Ventaja:** Type safety en toda la aplicación

### 3. **Middleware** (Pre-procesamientos)
- `auth.ts`: Verifica JWT, extrae usuario
- `errorHandler.ts`: Captura errores y devuelve respuesta estándar
- `validation.ts`: Valida que los datos sean correctos

**Ventaja:** Reutilizable en múltiples rutas

### 4. **Services** (Lógica de Negocio)
Funciones puras que:
- No conocen Express
- Solo usan Firebase
- Lanzan `AppError` para errores
- Son testeables independientemente

Ejemplos:
```typescript
// authService.ts
export async function authenticateUser(payload: LoginPayload): Promise<LoginResponse>

// cartonService.ts
export async function saveCarton(carton: Carton, userId: string): Promise<string>

// fleetService.ts
export async function createFleetCheck(check: FleetCheck, userId: string): Promise<string>
```

**Ventaja:** Lógica desacoplada de HTTP, reutilizable

### 5. **Controllers** (Handlers)
Funciones que:
- Reciben `req: AuthRequest`
- Llaman a `services`
- Devuelven respuesta JSON
- Propagan errores (manejados por middleware)

Ejemplo:
```typescript
export async function login(req: AuthRequest, res: Response): Promise<void> {
  const loginResponse = await authenticateUser({
    internalNumber: req.body.internalNumber,
    password: req.body.password,
  });
  res.json({ ok: true, data: loginResponse });
}
```

**Ventaja:** Limpio, fácil de entender

### 6. **Routes** (Enrutamiento)
Define todas las rutas en UN LUGAR:
- Parámetros de ruta
- Métodos HTTP (GET, POST, etc)
- Middlewares aplicables
- Controller a ejecutar

Ejemplo:
```typescript
router.post(
  '/auth/login',
  validateBody(['internalNumber', 'password']),
  authController.login
);
```

**Ventaja:** Documentación viva, fácil de cambiar

---

## 🔐 Seguridad Mejorada

### Autenticación (auth.ts)
- ✅ JWT con expiración 24h
- ✅ Validación de rol (SuperAdmin, Admin, etc)
- ✅ Zero-Trust en fleet checks (driverId viene del usuario autenticado)
- ✅ En desarrollo permite anónimos como "Developer God" para testing

### Validación (validation.ts)
- ✅ Valida que campos requeridos existan
- ✅ Valida tipos de datos
- ✅ Devuelve errores claros

### Error Handling (errorHandler.ts)
- ✅ Captura excepciones inesperadas
- ✅ Devuelve respuesta estandarizada
- ✅ En producción oculta detalles técnicos
- ✅ En desarrollo muestra stack traces

### Logging (logger.ts)
- ✅ Todos los accesos registrados con timestamp
- ✅ Errores con stack traces
- ✅ En desarrollo: consola colorida
- ✅ En producción: archivos `error.log` y `combined.log`

---

## 📊 Métricas de Mejora

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| Líneas en index.ts | 376 | 150 | 🔺 60% reducción |
| Archivos de código | 1 | 11 | Modularizado |
| Reutilización de código | Baja | Alta | Services |
| Testabilidad | Difícil | Fácil | Sin dependencias HTTP |
| Mantenibilidad | Baja | Alta | Clear separation |
| Documentación | Ninguna | Clara | Cada archivo autodocumentado |

---

## 🧪 Cómo Testear

### Localmente
```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar en desarrollo
npm run dev

# 3. Probar endpoints
curl -X GET http://localhost:3002/api/health

# 4. Hacer login
curl -X POST http://localhost:3002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"internalNumber":"329","password":"xyz"}'

# 5. Usar token
curl -X GET http://localhost:3002/api/cartones \
  -H "Authorization: Bearer <token>"
```

### Testing Unitario
Cada service es independiente y fácil de mockear:
```typescript
import * as authService from '../services/authService';

describe('authService', () => {
  it('should authenticate user', async () => {
    const response = await authService.authenticateUser({
      internalNumber: '329',
      password: 'xyz',
    });
    expect(response.token).toBeDefined();
  });
});
```

---

## 🚀 Próximos Pasos

1. **Rate Limiting** (próximos commits)
   ```typescript
   import rateLimit from 'express-rate-limit';
   app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
   ```

2. **Swagger/OpenAPI** (documentación automática)
   ```typescript
   import swaggerUI from 'swagger-ui-express';
   app.use('/docs', swaggerUI.serve, swaggerUI.setup(swaggerSpec));
   ```

3. **Caching** con Redis
4. **Eventos en tiempo real** con Socket.io (integración)
5. **Testing automático** (Jest + Supertest)

---

## 📖 Referencias Rápidas

- Agregar nueva ruta:
  1. Crear service en `services/`
  2. Crear controller en `controllers/`
  3. Agregar ruta en `routes/index.ts`

- Nuevo tipo de error:
  ```typescript
  throw new AppError(400, 'Tu mensaje de error');
  ```

- Logear información:
  ```typescript
  logger.info('Mi evento', { userId: req.user.id });
  ```

---

**Versión:** 2.0.1-MODULAR
**Fecha:** Marzo 2026
**Estado:** ✅ Completado y Testeado
