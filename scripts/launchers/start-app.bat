@echo off
echo ===================================================
echo   Iniciando TransformaFacil 2.0 - Entorno Dev
echo ===================================================

echo Conectando a Backend Cloud (Serverless)...
echo (No se requiere servidor local para Backend)

echo Iniciando Frontend (Puerto 5173)...
start "TransformaFacil Frontend" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   Aplicacion iniciada!
echo   Frontend: http://localhost:5173
echo   Backend:  https://ucot-gestor-cloud.cloudfunctions.net
echo   
echo   Mantenga estas ventanas abiertas para que
echo   el sistema siga funcionando.
echo ===================================================
pause
