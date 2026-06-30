@echo off
REM Windows double-click launcher: opens index.html in default browser
set "DIR=%~dp0"
set "HTML=%DIR%..\index.html"
if not exist "%HTML%" (
  set "HTML=%USERPROFILE%\maybeso\index.html"
)
start "" "%HTML%"
