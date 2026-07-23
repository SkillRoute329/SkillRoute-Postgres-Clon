Write-Host "Iniciando Limpieza Extrema..."
docker-compose down -v
docker system prune -a --volumes -f
$services = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if ($services) {
    Write-Host "Deteniendo servicios nativos de PostgreSQL..."
    Stop-Service -Name "postgresql*" -Force -ErrorAction SilentlyContinue
}
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
Remove-Item -Recurse -Force "node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "frontend/node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "backend/node_modules" -ErrorAction SilentlyContinue
Write-Host "Limpieza completada con éxito."
