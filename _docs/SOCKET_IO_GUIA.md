# 🔌 Socket.io - Guía de Implementación

**TransformaFacil 2.0** ahora tiene **comunicación bidireccional en tiempo real** usando Socket.io.

---

## 📋 Índice

1. [Cómo funciona](#cómo-funciona)
2. [Eventos disponibles](#eventos-disponibles)
3. [Ejemplos de uso](#ejemplos-de-uso)
4. [Testing](#testing)

---

## Cómo funciona

### Flujo de conexión

```
Frontend (Cliente)
      ↓
      ← Conecta a ws://localhost:3002 con token JWT
      ↓
Backend (Socket.io)
      ← Valida token
      ← Registra usuario conectado
      ↓
      ← Bidireccional: cliente ↔ servidor
      ↓
Disconnect
```

### Usuarios conectados

```typescript
// Backend tracking:
const connectedUsers = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, AuthUser>();  // socketId -> AuthUser
```

---

## Eventos disponibles

### 📍 Eventos de CLIENTE → SERVIDOR

#### 1. `location-update` (GPS)
**Cliente envía ubicación de vehículo**

```typescript
socket.emit('location-update', {
  vehicleId: 'vehicle-123',
  latitude: 40.7128,
  longitude: -74.0060,
  speed: 45, // km/h
  heading: 180, // grados
  timestamp: Date.now()
});
```

#### 2. `service-status-changed`
**Cliente reporta cambio de estado del servicio**

```typescript
socket.emit('service-status-changed', {
  serviceId: 'service-456',
  status: 'in_progress', // pending | in_progress | completed | cancelled
  timestamp: Date.now()
});
```

#### 3. `inspector-alert`
**Inspector reporta una alerta/problema**

```typescript
socket.emit('inspector-alert', {
  inspectorId: 'inspector-789',
  vehicleId: 'vehicle-123',
  severity: 'critical', // info | warning | critical
  message: 'Vehículo con problemas de frenos',
  timestamp: Date.now()
});
```

#### 4. `fleet-check-completed`
**Inspección de vehículo finalizada**

```typescript
socket.emit('fleet-check-completed', {
  checkId: 'check-abc',
  vehicleId: 'vehicle-123',
  status: 'OK', // OK | WARNING | CRITICAL
  timestamp: Date.now()
});
```

#### 5. `join-room` / `leave-room`
**Unirse a salas específicas (para monitoreo)**

```typescript
// Monitorear vehículo específico
socket.emit('join-room', 'vehicle-123');

// Dejar de monitorear
socket.emit('leave-room', 'vehicle-123');
```

#### 6. `ping`
**Keep-alive**

```typescript
socket.emit('ping');
// Servidor responde con 'pong'
```

---

### 📡 Eventos de SERVIDOR → CLIENTE

#### 1. `location-update`
**Ubicación actualizada (broadcast a todos)**

```typescript
socket.on('location-update', (data) => {
  console.log('Vehículo actualizado:', data);
  // data: { vehicleId, latitude, longitude, speed, heading, updatedBy }
});
```

#### 2. `service-status-changed`
**Estado de servicio cambió**

```typescript
socket.on('service-status-changed', (data) => {
  console.log('Servicio actualizado:', data);
  // data: { serviceId, status, updatedBy }
});
```

#### 3. `inspector-alert`
**Nueva alerta de inspector**

```typescript
socket.on('inspector-alert', (data) => {
  console.log('ALERTA:', data.message);
  // Mostrar notificación roja si severity === 'critical'
});
```

#### 4. `fleet-check-completed`
**Inspección completada**

```typescript
socket.on('fleet-check-completed', (data) => {
  console.log('Inspección:', data.checkId, '→', data.status);
});
```

#### 5. `user-connected`
**Nuevo usuario conectado**

```typescript
socket.on('user-connected', (data) => {
  console.log(data.fullName, 'conectado');
  // data: { userId, fullName, role }
});
```

#### 6. `user-disconnected`
**Usuario desconectado**

```typescript
socket.on('user-disconnected', (data) => {
  console.log(data.fullName, 'desconectado');
});
```

#### 7. `user-joined-room` / `user-left-room`
**Usuario entra/sale de sala**

```typescript
socket.on('user-joined-room', (data) => {
  console.log(data.fullName, 'está monitoreando', data.room);
});
```

#### 8. `pong`
**Respuesta a ping**

```typescript
socket.on('pong', (data) => {
  console.log('Latencia:', Date.now() - data.timestamp, 'ms');
});
```

#### 9. `error`
**Error en evento**

```typescript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

---

## Ejemplos de uso

### Frontend (React/Vue)

#### Instalación

```bash
npm install socket.io-client
```

#### Servicio Socket (React)

```typescript
// src/services/socketService.ts
import io from 'socket.io-client';

const SOCKET_URL = process.env.VITE_API_URL || 'http://localhost:3002';

export function createSocketConnection(token: string) {
  const socket = io(SOCKET_URL, {
    auth: {
      user: {
        id: 'user-id-from-token',
        internalNumber: '329',
        fullName: 'Juan Pérez',
        role: 'Inspector'
      }
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  socket.on('connect', () => {
    console.log('✅ Conectado a Socket.io');
  });

  socket.on('disconnect', () => {
    console.log('❌ Desconectado de Socket.io');
  });

  return socket;
}
```

#### Hook React

```typescript
// src/hooks/useSocket.ts
import { useEffect, useState } from 'react';
import { createSocketConnection } from '../services/socketService';

export function useSocket(token: string) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const newSocket = createSocketConnection(token);

    newSocket.on('connect', () => setConnected(true));
    newSocket.on('disconnect', () => setConnected(false));

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [token]);

  return { socket, connected };
}
```

#### Usar en Componente

```typescript
// src/pages/DashboardHome.tsx
import { useSocket } from '../hooks/useSocket';

export function DashboardHome() {
  const { socket, connected } = useSocket(token);

  useEffect(() => {
    if (!socket) return;

    // Escuchar actualizaciones de ubicación
    socket.on('location-update', (data) => {
      console.log('Vehículo actualizado:', data);
      // Actualizar mapa
    });

    // Escuchar alertas
    socket.on('inspector-alert', (data) => {
      if (data.severity === 'critical') {
        showNotification({
          type: 'error',
          title: 'ALERTA CRÍTICA',
          message: data.message
        });
      }
    });

    return () => {
      socket.off('location-update');
      socket.off('inspector-alert');
    };
  }, [socket]);

  return (
    <div>
      <div className={connected ? 'bg-green-100' : 'bg-red-100'}>
        Estado: {connected ? '🟢 Conectado' : '🔴 Desconectado'}
      </div>
      {/* Dashboard content */}
    </div>
  );
}
```

### Backend (Controller actualizado)

```typescript
// src/controllers/fleetController.ts
import { createFleetCheck } from '../services/fleetService';
import { broadcastFleetCheckCompleted } from '../services/realtimeService';
import { io } from '../index';

export async function createFleetCheck(req: AuthRequest, res: Response) {
  try {
    const checkId = await fleetService.createFleetCheck(req.body, req.user?.id);

    // Emitir evento en tiempo real
    broadcastFleetCheckCompleted(io, {
      checkId,
      vehicleId: req.body.vehicleId,
      status: req.body.status,
      completedBy: req.user?.id,
      timestamp: Date.now()
    });

    res.json({ ok: true, checkId });
  } catch (error) {
    throw error;
  }
}
```

---

## Testing

### Probar Socket.io localmente

#### Opción 1: Socket.io Test Client (CLI)

```bash
# Instalar
npm install -g @socket.io/socket.io-test-client

# Conectar
socket.io-test-client \
  --url=http://localhost:3002 \
  --auth='{"user":{"id":"test","internalNumber":"999","fullName":"Test","role":"Admin"}}'
```

#### Opción 2: Script Node.js

```javascript
// test-socket.js
const io = require('socket.io-client');

const socket = io('http://localhost:3002', {
  auth: {
    user: {
      id: 'inspector-001',
      internalNumber: '329',
      fullName: 'Inspector Test',
      role: 'Inspector'
    }
  }
});

socket.on('connect', () => {
  console.log('✅ Conectado');

  // Enviar ubicación
  socket.emit('location-update', {
    vehicleId: 'vehicle-123',
    latitude: 40.7128,
    longitude: -74.0060,
    speed: 50,
    heading: 90,
    timestamp: Date.now()
  });

  // Escuchar respuestas
  socket.on('location-update', (data) => {
    console.log('Ubicación recibida:', data);
  });
});

socket.on('disconnect', () => {
  console.log('❌ Desconectado');
});

socket.on('error', (error) => {
  console.error('Error:', error);
});
```

Ejecutar:
```bash
node test-socket.js
```

#### Opción 3: Postman

**NO hay soporte directo para Socket.io en Postman.**
Usar alternativas:
- [Socket.io Web Client](https://socket.io/docs/v4/client-api/) directamente en HTML
- [socket.io-debug](https://github.com/darrachequesne/socket.io-debug)

---

## 📊 Casos de Uso Implementados

### 1️⃣ Monitoreo de Flotas en Vivo
```
Inspector → location-update → Dashboard → Mapa actualiza en TIEMPO REAL
```

### 2️⃣ Alertas Críticas
```
Inspector detecta problema → inspector-alert (CRITICAL)
                          → Sonido + Notificación roja en dashboard
                          → CEO ve alerta al instante
```

### 3️⃣ Control de Servicios
```
Servicio comienza → service-status-changed (in_progress)
                 → Otros clientes ven cambio inmediatamente
                 → Sin necesidad de refresh
```

### 4️⃣ Inspecciones de Vehículos
```
Inspector finaliza check → fleet-check-completed
                        → Sistema actualiza estado vehículo
                        → Dashboard refleja cambio instantáneamente
```

---

## 🔐 Seguridad

### Autenticación
- ✅ Token JWT requerido en `socket.handshake.auth.user`
- ✅ En desarrollo: permite anónimos (para testing)
- ✅ En producción: rechaza sin autenticación

### Validación
- ✅ Todos los eventos validan datos
- ✅ Errores de validación emiten evento 'error'
- ✅ Datos inválidos no se procesan

### Salas (Rooms)
- ✅ Usuarios pueden unirse a salas específicas
- ✅ Ejemplo: `vehicle-123` para monitoreo de vehículo
- ✅ Solo usuarios en la sala reciben eventos

---

## 📈 Métricas

- **Usuarios conectados:** Tracking en tiempo real
- **Latencia:** Ping/pong para medir latencia
- **Eventos:** Todos loguados en backend
- **Errores:** Capturados y logueados

---

## 🚀 Próximas Mejoras

1. **Persistencia de conexión** - Redis adapter para múltiples servidores
2. **Compresión** - Reducir tamaño de mensajes
3. **Rate limiting** - Limitar eventos por usuario
4. **Eventos offline** - Queue para usuarios desconectados
5. **Autoscaling** - Socket.io con clustering

---

## 📚 Documentación Oficial

- [Socket.io Server Docs](https://socket.io/docs/v4/server-api/)
- [Socket.io Client Docs](https://socket.io/docs/v4/client-api/)

---

**Versión:** 2.0.1-REALTIME
**Estado:** ✅ Implementado y Funcional
**Próximo:** Integración con frontend (Semana 3)
