# SkillRoute - Sistema de Inteligencia de Tráfico (Zero-Config)

Este repositorio contiene la plataforma "llave en mano" de SkillRoute, incluyendo el sistema integral de monitoreo, análisis de competencia (Radar) y predicción de horarios. La arquitectura ha sido adaptada para funcionar de forma 100% aislada usando Docker y un backup completo de la base de datos `skillroute_soberano`.

---

## 🤖 INSTRUCCIONES AUTOMATIZADAS PARA ANTIGRAVITY (IA)

> [!IMPORTANT]
> **Aviso para Antigravity o agentes similares:** Si estás leyendo esto tras clonar el repositorio en una PC nueva, **DEBES ejecutar exactamente los bloques de PowerShell listados a continuación en orden**. NO intentes instalar Postgres manualmente. 

### FASE 1: Limpieza Extrema (Deep Clean)
El objetivo de esta fase es destruir cualquier residuo de pruebas previas, contenedores huérfanos o servicios locales nativos que estén bloqueando los puertos `5432` o `5433`. Ejecuta este bloque de PowerShell:

```powershell
Write-Host "Iniciando Limpieza Extrema..."

# 1. Apagar y destruir todos los contenedores y redes de Docker en esta carpeta
docker-compose down -v

# 2. Forzar limpieza profunda de Docker (imágenes huérfanas, volúmenes colgados)
docker system prune -a --volumes -f

# 3. Detener servicios nativos de Postgres en Windows que puedan crear conflicto de puertos
$services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($services) {
    Write-Host "Deteniendo servicios nativos de PostgreSQL..."
    Stop-Service -Name "postgresql*" -Force -ErrorAction SilentlyContinue
}

# 4. Matar cualquier proceso residual en el puerto 5432 o 5433
$ports = @(5432, 5433)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            Write-Host "Matando proceso $pidToKill que ocupa el puerto $port"
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
        }
    }
}

# 5. Borrar las carpetas node_modules para evitar cachés corruptas
Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend/node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "backend/node_modules" -ErrorAction SilentlyContinue

Write-Host "Limpieza completada con éxito."
```

### FASE 2: Instalación e Inicialización ("Zero-Config")

Una vez que el entorno esté purgado, debes levantar el sistema. Todo el proceso está encapsulado en el script `Instalar-y-Ejecutar.bat`, el cual:
1. Instalará las dependencias de Node.
2. Construirá el contenedor de Docker para Postgres (exponiendo en el puerto **5433**).
3. Inyectará automáticamente el dump comprimido (`backend/database/init_soberano.sql.gz`) restaurando la estructura GTFS, usuarios y datos.
4. Iniciará los servidores Frontend y Backend simultáneamente usando `npm run dev`.

**Agente, ejecuta el siguiente comando en PowerShell desde la raíz del proyecto:**

```powershell
.\Instalar-y-Ejecutar.bat
```

> [!TIP]
> **Verificación Post-Instalación:**
> Tras ejecutar el `.bat`, valida que el contenedor esté corriendo con `docker ps`.
> Verifica que la BD se haya restaurado probando una consulta al puerto `5433` a la base de datos `skillroute_soberano`.
> Puedes comprobar el front-end navegando a `http://localhost:3006`.

---

## 🛠 Mantenimiento Manual (Para Humanos)

Si prefieres no usar el `.bat`, los pasos manuales son:

1. **Levantar Base de Datos:**
   ```bash
   docker-compose up -d
   ```
   *Nota: La primera vez que el contenedor levante, Docker leerá el script `init_soberano.sql.gz` y creará la base de datos de manera automática. Este proceso toma unos 15-30 segundos.*

2. **Arrancar Servicios (Frontend y Backend al unísono):**
   ```bash
   npm install
   npm run dev
   ```

El backend corre sobre Node.js y buscará las credenciales en su archivo `.env` (apuntando al `localhost:5433`). El frontend (React/Vite) compilará e iniciará en el navegador automáticamente.
