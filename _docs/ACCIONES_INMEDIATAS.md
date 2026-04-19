# ⚡ ACCIONES INMEDIATAS - HOY

## 🎯 OBJETIVO
Poner TransformaFacil 2.0 en marcha operativa en los próximos **7 días**.

---

## DÍA 1: VERIFICACIÓN Y DIAGNÓSTICO (2-3 horas)

### 1. Verificar que el proyecto inicia
```bash
cd TransformaFacil-2.0
npm run dev
```

**Esperado:**
- ✅ Backend en http://localhost:3002 sin errores
- ✅ Frontend en http://localhost:5173 sin errores
- ✅ Pantalla de login visible

**Si hay error:**
- Revisar consola de errores
- Verificar versión de Node (v20+)
- Ejecutar `npm run install:all` nuevamente

### 2. Verificar diagnóstico del sistema
```bash
curl http://localhost:3002/api/doctor
```

**Esperado respuesta:**
```json
{
  "status": "HEALTHY",
  "database": {
    "connected": true,
    "vehicleCount": X,
    "cartonCount": Y
  },
  "version": "2.0.1-HARDENED"
}
```

### 3. Completar checklist de verificación

- [ ] Frontend carga sin errores (F12 > Console)
- [ ] Backend responde a `/api/health`
- [ ] Firebase está conectado (revisar logs)
- [ ] Base de datos tiene datos iniciales
- [ ] No hay warnings críticos en console

---

## DÍA 2: CONFIGURACIÓN INICIAL (3-4 horas)

### 1. Configurar variables de entorno

**Archivo: `backend/.env`**
```
PORT=3002
NODE_ENV=development
JWT_SECRET=cambiar-en-produccion-con-string-seguro
FIREBASE_CONFIG={"projectId":"tu-proyecto","...":"..."}
LOG_LEVEL=debug
```

**Archivo: `frontend/.env`** (si no existe)
```
VITE_API_URL=http://localhost:3002
VITE_FIREBASE_PROJECT=tu-proyecto
VITE_ENVIRONMENT=development
```

### 2. Cargar datos iniciales (si faltan)

**Opción A - Usar seed script:**
```bash
npm run seed:qa
# Carga datos de prueba en Firestore
```

**Opción B - Importar desde Excel:**
1. Ir a `/dashboard/admin/data-import`
2. Descargar template: `GET /api/data-import/template`
3. Llenar con tus servicios
4. Subir y procesar

### 3. Crear usuario administrador

En Firebase Console:
1. Ir a Authentication > Users
2. Crear usuario: interno=`999`, password=`Admin123!`
3. En Firestore, crear doc en `personal/` con rol `SuperAdmin`

```json
{
  "internalNumber": "999",
  "fullName": "Administrador Sistema",
  "email": "admin@transportadora.local",
  "password": "Admin123!",
  "role": "SuperAdmin",
  "status": "active"
}
```

---

## DÍA 3: PRUEBAS BÁSICAS (2-3 horas)

### 1. Login y navegación
```
Usuario: 999
Contraseña: Admin123!
```

Verificar acceso a:
- [ ] Dashboard (debe mostrar "Hola, Administrador")
- [ ] Matriz de Servicios (debe cargar líneas)
- [ ] Control de Inspectores
- [ ] Gestión de Usuarios (admin)

### 2. Prueba de inspección de vehículo
1. Ir a Fleet > Vehicle List
2. Seleccionar un vehículo
3. Hacer "Inspection Check" (foto/detalles)
4. Verificar que se guarda en Firestore

### 3. Prueba de generación de reportes
1. Ir a Reportes > Servicios Completados
2. Generar PDF
3. Exportar a Excel
4. Verificar que los datos son correctos

---

## DÍA 4: CONFIGURAR TIEMPO REAL (3-4 horas)

### 1. Verificar Socket.io está activo

**Backend:**
```bash
# En backend/src/index.ts, agregar al final:
const socketIO = require('socket.io');
const io = socketIO(app, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
  console.log('Client conectado:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client desconectado:', socket.id);
  });
});
```

### 2. Escuchar eventos en frontend

**Frontend:** `src/services/realtimeService.ts`
```typescript
import io from 'socket.io-client';

export const socket = io('http://localhost:3002', {
  reconnection: true,
});

socket.on('service-status-changed', (data) => {
  console.log('Servicio actualizado:', data);
  // Actualizar UI aquí
});

socket.on('vehicle-location', (data) => {
  console.log('GPS actualizado:', data);
  // Mostrar en mapa aquí
});
```

### 3. Probar comunicación en vivo
1. Abrir 2 browsers en paralelo (sesión usuario + sesión inspector)
2. Cambiar estado de servicio en uno
3. Verificar que el otro ve el cambio al instante

---

## DÍA 5: COMPLETAR SISTEMA DE BOLETOS (4-5 horas)

### 1. Completar interfaz de venta

**Archivo: `frontend/src/pages/Marketplace.tsx`**

Necesita:
- [ ] Seleccionar ruta/línea
- [ ] Seleccionar fecha y hora
- [ ] Mapa de asientos interactivo
- [ ] Carrito de compra
- [ ] Cálculo de precio

### 2. Integrar procesamiento de pago

Opciones (elige una):

**A) Stripe (Recomendado)**
```bash
npm install stripe react-stripe-js @stripe/stripe-js
```

**B) Mercado Pago**
```bash
npm install @mercadopago/sdk-nodejs
```

**C) PayPal**
```bash
npm install @paypal/checkout-server-sdk
```

### 3. Generar QR para boleto

```typescript
import QRCode from 'qrcode';

const generateTicketQR = (ticketId) => {
  const data = `TICKET_${ticketId}_${Date.now()}`;
  return QRCode.toDataURL(data);
};
```

### 4. Enviar email confirmación

```typescript
// Usar Firebase Cloud Functions o servicio externo
const sendTicketEmail = async (email, ticketData) => {
  await sendEmail({
    to: email,
    subject: `Tu boleto de transporte #${ticketData.id}`,
    html: generateTicketHTML(ticketData)
  });
};
```

---

## DÍA 6: DASHBOARDS Y REPORTES (3-4 horas)

### 1. CEO Dashboard

**Crear: `frontend/src/pages/traffic/CEODashboard.tsx`**

Componentes:
- [ ] KPI Cards: Ingresos hoy, ocupación %, puntualidad
- [ ] Gráfico de ingresos por hora (Chart.js/Recharts)
- [ ] Mapa de flotas en vivo
- [ ] Alertas operacionales
- [ ] Tabla de servicios completados

```typescript
// Ejemplo de KPI Card
const IncomeCard = ({ amount, change }) => (
  <div className="bg-gradient-to-r from-green-400 to-green-600 p-6 rounded">
    <p className="text-white text-sm">INGRESOS HOY</p>
    <h3 className="text-3xl font-bold text-white">${amount}</h3>
    <p className={`text-sm ${change > 0 ? 'text-green-100' : 'text-red-100'}`}>
      {change > 0 ? '↑' : '↓'} {Math.abs(change)}% vs ayer
    </p>
  </div>
);
```

### 2. Reportes automáticos

**Crear: `backend/src/services/reportService.ts`**

Generar diariamente:
- Resumen de ingresos por línea
- Ocupación promedio
- Incidentes/reportes
- Consumo de combustible
- Desempeño de inspectores

### 3. Exportar a PDF/Excel

```typescript
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const generateReport = (data) => {
  const doc = new jsPDF();
  autoTable(doc, {
    head: [['Línea', 'Ingresos', 'Ocupación']],
    body: data.map(d => [d.line, d.income, d.occupancy])
  });
  return doc.output('arraybuffer');
};
```

---

## DÍA 7: CAPACITACIÓN Y VALIDACIÓN FINAL (2-3 horas)

### 1. Crear manual de usuario

**Documento: `MANUAL_USUARIO_FINAL.md`**

Secciones:
- Cómo hacer login
- Cómo crear un turno
- Cómo inspeccionar vehículo
- Cómo vender boleto
- Cómo generar reporte
- FAQ y troubleshooting

### 2. Capacitar operadores clave

Sesión de 1 hora con:
- Supervisor de flotas
- Inspector líder
- Operador de ventas
- Administrador

Cubrir:
- [ ] Acceso al sistema
- [ ] Dashboard diario
- [ ] Reporte de incidencias
- [ ] Consulta de boletos vendidos

### 3. Checklist final GO-LIVE

- [ ] Backend sin errores en logs
- [ ] Frontend carga en < 3 segundos
- [ ] Login funciona con 5 usuarios diferentes
- [ ] Datos se guardan en Firestore
- [ ] Reportes se generan correctamente
- [ ] Tiempo real funciona (Socket.io)
- [ ] Venta de boletos acepta compras
- [ ] Emails se envían
- [ ] Sistema soporta 10 usuarios concurrentes

---

## DESPUÉS DEL DÍA 7: INICIO DE OPERACIÓN

✅ **Sistema en Marcha:**
- Usuarios usando dashboards diarios
- Boletos siendo vendidos
- Datos recolectados en tiempo real
- Reportes generados automáticamente

⚠️ **Monitoreo Continuo:**
- Revisar logs diarios
- Atender incidencias de usuarios
- Hacer copias de seguridad
- Documentar mejoras solicitadas

---

## 📋 CHECKLIST MASTER - Marcar conforme avances

### Días 1-3 (Semana 1)
- [ ] Proyecto inicia sin errores
- [ ] Diagnóstico del sistema OK
- [ ] Variables de entorno configuradas
- [ ] Datos iniciales cargados
- [ ] Usuario admin creado
- [ ] Login funciona

### Días 4-5 (Semana 1)
- [ ] Socket.io activo
- [ ] Evento de sincronización en vivo funciona
- [ ] Sistema de boletos completo
- [ ] Pagos integrados
- [ ] QR generándose

### Días 6-7 (Semana 2)
- [ ] Dashboard CEO con KPIs
- [ ] Reportes automáticos
- [ ] Exportación PDF/Excel
- [ ] Manual de usuario listo
- [ ] Capacitación completada
- [ ] Validación final OK

---

## 🆘 PROBLEMAS Y SOLUCIONES RÁPIDAS

| Problema | Solución |
|----------|----------|
| Puerto 3002 en uso | `lsof -i :3002` luego `kill -9 PID` |
| Module not found | `npm install` en la carpeta faltante |
| Firebase sin conectar | Revisar `.env` y credenciales |
| Build lento | Limpiar `node_modules` y reinstalar |
| Datos no se guardan | Revisar permisos en Firestore |
| API no responde | Reiniciar backend con `npm run dev` |

---

## 📞 CONTACTO DE SOPORTE

Si algo no funciona:
1. Revisar logs en terminal
2. Consultar `ANALISIS_TECNICO_COMPLETO.docx`
3. Buscar en FAQ (próximamente)
4. Reportar en GitHub Issues

---

**Objetivo:** En 7 días, TransformaFacil debe estar **OPERATIVO**.
**Responsabilidad:** Cada tarea asignada debe completarse ese día.
**Éxito:** Medido por usuarios activos usando el sistema.

🚀 **¡Adelante con la transformación!**
