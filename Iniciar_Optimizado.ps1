Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Iniciando Backend..." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit -Command `"cd backend; npm run dev`""

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Compilando Frontend (Modo Alta Performance)..." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
cd frontend
cmd /c npm run build

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Levantando el Frontend Optimizado..." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
cmd /c npm run preview
