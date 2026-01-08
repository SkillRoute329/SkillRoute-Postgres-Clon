@echo off
echo ===================================================
echo   Iniciando TransformaFacil 2.0 - Entorno Dev
echo ===================================================

echo Iniciando Backend (Puerto 4000)...
start "TransformaFacil Backend" cmd /k "cd backend && npm run dev"

echo Iniciando Frontend (Puerto 5173)...
start "TransformaFacil Frontend" cmd /k "cd frontend && npm run dev"

echo ===================================================
echo   Aplicacion iniciada!
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:4000
echo   
echo   Mantenga estas ventanas abiertas para que
echo   el sistema siga funcionando.
echo ===================================================
pause
