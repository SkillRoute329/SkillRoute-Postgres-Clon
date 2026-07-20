# SkillRoute - Sistema de Inteligencia de Tráfico

Este repositorio contiene la plataforma "llave en mano" de SkillRoute, un sistema integral de monitoreo, análisis de competencia (Radar) y predicción de horarios, operando con una base de datos PostgreSQL local para garantizar soberanía de datos y alta velocidad de procesamiento.

## Requisitos Previos (Instalación en un ordenador nuevo)

Para replicar este entorno de desarrollo/producción en otra máquina, necesitarás instalar las siguientes herramientas:

1. **Node.js** (v18.0 o superior) - Entorno de ejecución para el Backend y el Frontend.
2. **PostgreSQL** (v14 o superior) - Motor de base de datos relacional.
3. **Git** - Para clonar y manejar el control de versiones.

*(Recomendado opcional: PgAdmin 4 o DBeaver para administrar la base de datos visualmente).*

---

## 1. Configuración de la Base de Datos (Postgres)

El sistema requiere una base de datos activa antes de arrancar.

1. Abre tu consola SQL (psql) o tu cliente de base de datos (PgAdmin) conectado al servidor de Postgres.
2. Crea la base de datos y el usuario (o usa el usuario `postgres` por defecto):
   ```sql
   CREATE DATABASE skillroute_soberano;
   ```
3. Verifica que las credenciales coincidan con el entorno.

---

## 2. Variables de Entorno (.env)

Debes crear un archivo `.env` dentro de la carpeta `/backend/`. Puedes duplicar el archivo `.env.example` si existe, o crear uno nuevo con la siguiente estructura base:

```ini
PORT=3001
NODE_ENV=development

# Base de datos (Ajustar DB_PORT, DB_USER y DB_PASS según tu máquina)
DB_HOST=127.0.0.1
DB_PORT=5433
DB_USER=postgres
DB_PASS=Skill329
DB_NAME=skillroute_soberano
DATABASE_URL=postgresql://postgres:Skill329@127.0.0.1:5433/skillroute_soberano

# API Externa STM / IMM
IMM_CLIENT_ID=tu_cliente_id
IMM_CLIENT_SECRET=tu_secreto

# JWT
JWT_SECRET=un_secreto_seguro_base64
JWT_EXPIRATION=8h
```

---

## 3. Automatización Llave en Mano (Migraciones y Semillas)

El sistema incluye comandos automatizados que construyen las tablas de la base de datos e inyectan los datos iniciales necesarios (GTFS de ómnibus, empresas, etc.).

Abre una terminal y colócate en la carpeta `/backend/`:

```bash
cd backend
npm install

# 1. Este comando ejecutará las migraciones (creará las tablas) y los seeds (inyectará los datos de prueba y catálogos).
npm run db:setup
```

*Nota técnica: El comando `npm run db:setup` es un atajo para `knex migrate:latest` seguido de `knex seed:run`.*

---

## 4. Arranque de los Servicios

El proyecto se divide en dos módulos: el backend (Node.js/Express/Postgres) y el frontend (React/Vite).

### Arrancar el Backend (Terminal 1)
```bash
cd backend
npm run dev
```
El servidor backend iniciará en el puerto `3001` y se conectará a la base de datos `skillroute_soberano`.

### Arrancar el Frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
```
La aplicación web se ejecutará en el puerto que te indique Vite (por lo general `localhost:5173`).

---

## Scripts Disponibles (Backend)

- `npm run db:migrate`: Ejecuta solo las migraciones SQL pendientes.
- `npm run db:seed`: Vuelve a poblar las tablas con los catálogos y datos iniciales.
- `npm run db:setup`: Ejecuta de forma limpia las migraciones y luego los seeds.
- `npm run build`: Compila el código TypeScript a JavaScript de producción (carpeta `dist/`).
- `npm run start`: Ejecuta el backend en modo producción (requiere build previo).
