Set WshShell = CreateObject("WScript.Shell")
' Executing the start script invisibly (0 = hidden)
WshShell.Run "cmd /c cd ""c:\Users\Usuario\Desktop\SkillRoute clon"" && npm run start", 0, False
