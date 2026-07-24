$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SkillRoute.lnk")
$Shortcut.TargetPath = "c:\Users\Usuario\Desktop\SkillRoute clon\start_skillroute.vbs"
$Shortcut.Save()
