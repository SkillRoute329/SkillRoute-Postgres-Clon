# INSTRUCCIONES PARA CONECTAR LA PC DE ESCRITORIO (CLIENTE) A LA LAPTOP (SERVIDOR)

> **ATENCIÓN AL AGENTE DE IA EN LA PC DE ESCRITORIO:** 
> Lee este documento antes de intentar arrancar el proyecto.

El entorno de desarrollo de este proyecto está configurado bajo una arquitectura de red local (Cliente-Servidor). La base de datos oficial de PostgreSQL, con todos los registros y usuarios locales, se encuentra alojada y ejecutándose físicamente en la **Laptop (Notebook)**.

La Laptop ya ha sido pre-configurada (modificando `pg_hba.conf` y `postgresql.conf`) para aceptar conexiones entrantes desde la red local.

Para que el proyecto funcione en esta PC de escritorio, debes apuntar el backend hacia la IP de la Laptop.

### 🛠️ PASOS A EJECUTAR (Instrucciones para el Agente / Usuario)

1. Abre el archivo `backend/.env` en este repositorio.
2. Busca la variable de entorno `DB_HOST`.
3. Cambia su valor actual (`localhost`) por la IP de la Laptop:
   ```env
   DB_HOST=192.168.1.11
   ```
4. Guarda el archivo.
5. Ahora puedes arrancar el servidor normalmente (por ejemplo, con `npm run dev` o `start-server.bat`). El backend se conectará exitosamente a PostgreSQL en la Laptop.

---

### ⚠️ Notas Importantes de Sincronización

* **Datos compartidos:** Todo lo que leas, edites o elimines desde la PC de escritorio se verá reflejado inmediatamente en la base de datos de la Laptop. ¡Cuidado con borrar datos de prueba valiosos!
* **Código separado:** A diferencia de la base de datos, el código fuente (los archivos `.ts`, `.tsx`, etc.) **no** se sincroniza automáticamente. Cuando termines de programar o reparar una función en la PC de escritorio, debes hacer `git commit` y `git push` a GitHub, para que luego se pueda hacer un `git pull` desde la Laptop.
