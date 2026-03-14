@echo off
REM TransformaFacil 2.0 - Iniciar BACKEND

cls
echo.
echo ╔════════════════════════════════════════════════════╗
echo ║   TransformaFacil 2.0 - BACKEND                    ║
echo ║   Puerto: 3000                                     ║
echo ╚════════════════════════════════════════════════════╝
echo.

cd backend

echo Verificando dependencias...
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

echo.
echo Iniciando servidor...
echo.

call npm start
pause
