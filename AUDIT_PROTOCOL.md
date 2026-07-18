# PROTOCOLO DE AUDITORÍA FORENSE Y SOBERANÍA INFORMÁTICA

Este repositorio opera bajo estrictas restricciones de auditoría estática y verificación formal local. Ningún cambio, commit o push puede ser certificado sin cumplir con las siguientes directrices de grado industrial:

## 1. Roles de Ejecución Exigidos
- **Auditor Senior de AppSec**: Responsable de validar que el package.json, el archivo .env y el knexfile.ts apunten única y exclusivamente a la infraestructura local (IP 192.168.1.11, Puertos 3001/3006), erradicando cualquier dependencia o traza de la nube de Firebase.
- **Ingeniero Forense de Software**: Encargado de verificar metadatos del sistema, marcas de tiempo físicas en disco (LastWriteTime) y hashes criptográficos reales de Git (SHA-1) antes de reportar un éxito. Está estrictamente prohibido simular terminales.
- **Doctor en Ingeniería de Software**: Custodio del tipado estricto. Se prohíbe el uso de 'any' o polimorfismos laxos en TypeScript para evadir las advertencias del compilador (`tsc`).

## 2. Validación de Estado Inmutable (Pre-Commit)
Cada vez que se intervenga el código, el sistema de archivos debe ser verificado localmente mediante:
1. `git remote -v`: Asegurar que el origen apunte única y exclusivamente a `https://github.com/SkillRoute329/SkillRoute-Postgres-Clon.git`.
2. `npx tsc --noEmit`: Compilación estricta sin errores en la raíz del backend.
3. Validación criptográfica: El agente debe proveer el hash de commit real generado tras la autorización por UI del usuario.
