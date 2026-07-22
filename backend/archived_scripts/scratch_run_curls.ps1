$TOKEN = (Get-Content C:\SkillRoute_Master\bridge\jwt_token.txt -Raw).Trim()
$headers = @{ Authorization = "Bearer $TOKEN" }
Invoke-RestMethod -Uri 'http://localhost:3001/api/compliance/regulador?empresa=all&desde=2026-05-05&hasta=2026-05-12&granularidad=diaria' -Headers $headers | ConvertTo-Json -Depth 10 | Out-File C:\SkillRoute_Master\bridge\regulador.json -Encoding UTF8
Invoke-RestMethod -Uri 'http://localhost:3001/api/compliance/operador?agencyId=70&desde=2026-05-05&hasta=2026-05-12&granularidad=diaria' -Headers $headers | ConvertTo-Json -Depth 10 | Out-File C:\SkillRoute_Master\bridge\operador.json -Encoding UTF8
