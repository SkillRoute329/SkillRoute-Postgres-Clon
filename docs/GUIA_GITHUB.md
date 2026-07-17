# Guía de Trabajo Remoto con GitHub

Esta guía explica los pasos exactos para poder trabajar en el proyecto SkillRoute desde múltiples computadoras (por ejemplo, entre una portátil y una computadora de escritorio) utilizando el repositorio central de GitHub.

## Repositorio Oficial
**URL:** `https://github.com/SkillRoute329/SkillRoute.git`

---

## 1. Configurar la Nueva Computadora (Ej. Computadora de Escritorio)

Si es la primera vez que vas a trabajar en la otra computadora, necesitas descargar todo el código del proyecto. 

1. **Abrir la terminal (Símbolo del sistema o PowerShell)** en la carpeta donde deseas guardar el proyecto.
2. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/SkillRoute329/SkillRoute.git
   ```
3. **Entrar a la carpeta del proyecto:**
   ```bash
   cd SkillRoute
   ```
4. **Cambiar a la rama en la que se está trabajando** (actualmente `feat/soberania-auth-fase-0-1`):
   ```bash
   git checkout feat/soberania-auth-fase-0-1
   ```
5. **Instalar dependencias:**
   Recuerda ejecutar `npm install` tanto en la carpeta `frontend/` como en `backend/` para instalar las librerías necesarias de Node.

## 2. Guardar y Subir Cambios (Desde cualquier computadora)

Una vez que realizaste cambios en el código, debes enviarlos a la nube (GitHub) para que la otra computadora pueda descargarlos.

1. **Agregar los cambios:**
   ```bash
   git add .
   ```
2. **Crear el "Commit" (Punto de guardado):**
   ```bash
   git commit -m "Descripción clara de lo que modificaste"
   ```
3. **Subir los cambios a GitHub (Push):**
   ```bash
   git push origin feat/soberania-auth-fase-0-1
   ```
   *(Si estás en otra rama, reemplaza el nombre al final del comando).*

## 3. Actualizar la Computadora Original (Ej. Tu Portátil)

Cuando regreses a tu portátil y quieras ver o seguir trabajando con los cambios que hiciste en la computadora de escritorio, **no necesitas volver a clonar**. Solo debes descargar las novedades.

1. **Abrir la terminal** dentro de la carpeta del proyecto (ej: `C:\SkillRoute_Master\repo`).
2. **Asegurarte de estar en la rama correcta** (si no lo estás ya):
   ```bash
   git checkout feat/soberania-auth-fase-0-1
   ```
3. **Descargar los cambios desde la nube (Pull):**
   ```bash
   git pull origin feat/soberania-auth-fase-0-1
   ```

¡Listo! Al ejecutar ese último comando, los archivos de tu portátil se actualizarán automáticamente para coincidir exactamente con lo que dejaste guardado en tu computadora de escritorio.
