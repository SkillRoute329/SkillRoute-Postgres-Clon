# Pruebas de usuario real (E2E)

Estas pruebas simulan a un usuario usando la app: entrar, login, dashboard y cerrar sesión.

## Cómo ejecutarlas

**Opción A – Con la app ya arrancada (recomendado)**

1. En una terminal: `npm start` (espera a que abra el navegador).
2. En otra terminal: `npm run test:e2e`  
   Así se usan backend y frontend reales y deberían pasar las 6 pruebas.

**Opción B – Solo Playwright**  
Ejecuta `npm run test:e2e`. Playwright arranca backend y frontend con `scripts/start-for-e2e.js`.  
Si el backend no llega a estar listo a tiempo, pueden fallar las pruebas que requieren login; las de redirección a login seguirán pasando.

## Pruebas incluidas

1. Usuario entra a la raíz y es redirigido al login
2. Usuario inicia sesión y llega al dashboard
3. Usuario ve estado de la API en el dashboard
4. Usuario cierra sesión y vuelve al login
5. Usuario sin sesión que intenta ir al dashboard es redirigido a login
6. Usuario ve el menú del dashboard (Dashboard, Tránsito, Admin)

Credenciales de prueba: usuario `329`, contraseña `admin123`.
