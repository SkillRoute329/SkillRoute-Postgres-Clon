@echo off
REM TransformaFacil 2.0 - Iniciar FRONTEND

cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   TransformaFacil 2.0 - FRONTEND                   ║
echo ║   Puerto: 3001                                     ║
echo ╚════════════════════════════════════════════════════╝
echo.

cd frontend

echo Verificando dependencias...
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

echo.
echo Iniciando servidor...
echo.

call npx serve dist -l 3001
pause
