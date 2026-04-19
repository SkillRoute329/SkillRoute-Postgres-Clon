# 🚀 DEPLOYMENT GUIDE - TransformaFacil 2.0
**Sistema:** Análisis de Competencia en Tiempo Real
**Autor:** Jonathan Laluz
**Versión:** 2.0.1

---

## 📋 ÍNDICE

1. [Deployment Local](#deployment-local)
2. [Deployment Docker](#deployment-docker)
3. [Deployment Heroku](#deployment-heroku)
4. [Deployment AWS](#deployment-aws)
5. [Deployment con tu propio servidor](#deployment-servidor-propio)
6. [Monitoreo y Mantenimiento](#monitoreo)

---

## 🖥️ DEPLOYMENT LOCAL

### Prerequisitos
- Node.js >= 18
- npm o yarn
- Git

### Paso 1: Preparar ambiente

```bash
# Clonar repositorio
git clone <tu-repo> transformafacil
cd transformafacil

# Ejecutar script de setup
bash scripts/deploy-local.sh
```

### Paso 2: Ejecutar servicios (3 terminales)

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Escucha en http://localhost:3002
```

**Terminal 2 - Bridge:**
```bash
cd backend
npm run bridge
# Escucha en http://localhost:3099
```

**Terminal 3 - Frontend:**
```bash
cd frontend
npm run dev
# Escucha en http://localhost:5173
```

### Verificación
```bash
# Health check
curl http://localhost:3099/health

# Obtener líneas UCOT
curl http://localhost:3099/api/lines/ucot

# Ejecutar tests
bash backend/test-analisis-competencia.sh
```

---

## 🐳 DEPLOYMENT DOCKER

### Prerequisitos
- Docker instalado
- Docker Compose instalado

### Paso 1: Build de imágenes

```bash
docker-compose build
```

### Paso 2: Iniciar servicios

```bash
# Iniciar en background
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

### Acceder a servicios

```
Frontend:      http://localhost:5173
Backend API:   http://localhost:3002
Bridge Server: http://localhost:3099
```

### Estructura de containers

```
transformafacil-backend    (Puerto 3002)
transformafacil-bridge     (Puerto 3099)
transformafacil-frontend   (Puerto 5173)
transformafacil-db         (PostgreSQL - Puerto 5432)
transformafacil-redis      (Redis - Puerto 6379)
transformafacil-nginx      (Reverse Proxy - Puertos 80/443)
```

---

## 🔴 DEPLOYMENT HEROKU

### Prerequisitos
- Heroku CLI instalado
- Cuenta de Heroku activa
- Git configurado

### Paso 1: Setup

```bash
# Ejecutar script de deployment
bash scripts/deploy-heroku.sh

# Se pedirán credenciales de Firebase y JWT
```

### Paso 2: Verificar deployment

```bash
# Ver logs del backend
heroku logs -a transformafacil-api -f

# Ver logs del bridge
heroku logs -a transformafacil-bridge -f

# Verificar health
curl https://transformafacil-bridge.herokuapp.com/health
```

### URLs en Heroku

```
Frontend:      https://transformafacil-web.herokuapp.com
Backend API:   https://transformafacil-api.herokuapp.com
Bridge Server: https://transformafacil-bridge.herokuapp.com
```

### Actualizar deployment

```bash
# Hacer cambios localmente
git add .
git commit -m "Update"

# Push a Heroku
git push heroku-api main:main
git push heroku-bridge main:main
git push heroku-web main:main
```

---

## ☁️ DEPLOYMENT AWS

### Opción 1: AWS Elastic Beanstalk

```bash
# Instalar EB CLI
pip install awsebcli

# Inicializar
eb init -p node.js-18 transformafacil

# Crear ambiente
eb create transformafacil-env

# Deploy
eb deploy

# Ver estado
eb status

# Ver logs
eb logs
```

### Opción 2: AWS EC2 + RDS + ElastiCache

**1. Crear EC2 Instance (Amazon Linux 2)**

```bash
# SSH a instancia
ssh -i key.pem ec2-user@<ip-publica>

# Instalar Node.js
curl -sL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Instalar PM2 (gestor de procesos)
sudo npm install -g pm2

# Clonar repositorio
git clone <tu-repo>
cd transformafacil
```

**2. Configurar variables de entorno**

```bash
cat > .env << EOF
NODE_ENV=production
PORT=3002
BRIDGE_PORT=3099
FIREBASE_PROJECT_ID=<tu-id>
FIREBASE_PRIVATE_KEY=<tu-key>
FIREBASE_CLIENT_EMAIL=<tu-email>
JWT_SECRET=<tu-secret>
DB_HOST=<rds-endpoint>
DB_USER=admin
DB_PASSWORD=<tu-password>
REDIS_URL=<elasticache-endpoint>:6379
BACKEND_URL=https://api.tudominio.com
BRIDGE_URL=https://bridge.tudominio.com
EOF
```

**3. Instalar y iniciar servicios**

```bash
# Instalar dependencias
cd backend && npm install && npm run build
cd ../frontend && npm install && npm run build
cd ..

# Usar PM2 para mantener procesos activos
pm2 start dist/index.js --name "backend"
pm2 start dist/bridge-server.js --name "bridge"
pm2 startup
pm2 save
```

**4. Configurar Nginx como reverse proxy**

```bash
sudo yum install -y nginx

sudo cat > /etc/nginx/conf.d/transformafacil.conf << EOF
upstream backend {
    server localhost:3002;
}

upstream bridge {
    server localhost:3099;
}

upstream frontend {
    server localhost:5173;
}

server {
    listen 80;
    server_name api.tudominio.com;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}

server {
    listen 80;
    server_name bridge.tudominio.com;

    location / {
        proxy_pass http://bridge;
        proxy_set_header Host \$host;
    }
}
EOF

sudo systemctl enable nginx
sudo systemctl start nginx
```

**5. SSL con Let's Encrypt**

```bash
sudo yum install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d api.tudominio.com -d bridge.tudominio.com
```

---

## 🖥️ DEPLOYMENT SERVIDOR PROPIO

### Requisitos

- Servidor VPS/Dedicado
- Ubuntu 20.04 o superior
- Dominio propio
- Acceso SSH

### Paso 1: Instalación base

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PM2
sudo npm install -g pm2

# Instalar Nginx
sudo apt install -y nginx

# Instalar Certbot (SSL)
sudo apt install -y certbot python3-certbot-nginx
```

### Paso 2: Clonar y configurar

```bash
# Crear usuario para la app
sudo useradd -m -s /bin/bash transformafacil
sudo su - transformafacil

# Clonar repositorio
git clone <tu-repo> transformafacil
cd transformafacil

# Copiar .env
cp backend/.env.production backend/.env

# Editar variables
nano backend/.env
```

### Paso 3: Instalar y compilar

```bash
cd backend
npm install
npm run build
cd ../frontend
npm install
npm run build
cd ..
```

### Paso 4: Configurar PM2

```bash
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: "backend",
      script: "dist/index.js",
      cwd: "./backend",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "bridge",
      script: "dist/bridge-server.js",
      cwd: "./backend",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
EOF

pm2 start ecosystem.config.js
pm2 startup
pm2 save
```

### Paso 5: Configurar Nginx

```bash
sudo cat > /etc/nginx/sites-available/transformafacil << EOF
upstream backend {
    server localhost:3002;
}

upstream bridge {
    server localhost:3099;
}

server {
    listen 80;
    server_name api.tudominio.com bridge.tudominio.com tudominio.com;

    client_max_body_size 50M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        proxy_pass http://bridge;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

# Activar configuración
sudo ln -s /etc/nginx/sites-available/transformafacil /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

### Paso 6: SSL con Certbot

```bash
sudo certbot --nginx -d tudominio.com -d api.tudominio.com -d bridge.tudominio.com
```

---

## 📊 MONITOREO Y MANTENIMIENTO

### Health Checks

```bash
# Verificar backend
curl https://api.tudominio.com/health

# Verificar bridge
curl https://bridge.tudominio.com/health

# Verificar que obtiene datos
curl https://bridge.tudominio.com/api/lines/ucot | jq '.totalLineas'
```

### Logs

```bash
# Docker Compose
docker-compose logs -f backend
docker-compose logs -f bridge

# Heroku
heroku logs -a transformafacil-api -f

# PM2
pm2 logs
pm2 logs backend
pm2 logs bridge

# Nginx
tail -f /var/log/nginx/error.log
tail -f /var/log/nginx/access.log
```

### Actualizaciones

```bash
# Descargar cambios
git pull origin main

# Recompilar
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Reiniciar servicios
pm2 restart all            # Local
docker-compose restart     # Docker
git push heroku-api main   # Heroku
```

### Backups

```bash
# Backup de base de datos
pg_dump transformafacil > backup.sql

# Backup de Redis
redis-cli BGSAVE

# Restaurar
psql transformafacil < backup.sql
```

---

## ✅ CHECKLIST PRE-PRODUCCIÓN

- [ ] Variables de entorno configuradas
- [ ] SSL/TLS habilitado (HTTPS)
- [ ] Firewall configurado
- [ ] Backups programados
- [ ] Monitoreo activo
- [ ] Rate limiting habilitado
- [ ] CORS configurado correctamente
- [ ] Logs centralizados
- [ ] Health checks configurados
- [ ] Plan de recuperación ante desastres

---

## 🆘 TROUBLESHOOTING

### Puerto ya en uso
```bash
# Encontrar proceso
lsof -i :3002
lsof -i :3099

# Matar proceso
kill -9 <PID>
```

### Errores de conexión a Firebase
```bash
# Verificar credenciales en .env
cat backend/.env | grep FIREBASE

# Probar conexión
node -e "require('firebase-admin').initializeApp()"
```

### Nginx no redirige correctamente
```bash
# Probar configuración
sudo nginx -t

# Recargar
sudo systemctl reload nginx
```

### Memory leak en Node.js
```bash
# Ver uso de memoria
pm2 monit

# Reiniciar proceso
pm2 restart backend
```

---

**¿Necesitas ayuda con algún deployment específico?**
Contacta al equipo de soporte o abre un issue en el repositorio.

