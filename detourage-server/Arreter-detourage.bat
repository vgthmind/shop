@echo off
rem La fenetre reste TOUJOURS ouverte (cmd /k) : tu peux lire le resultat.
if /i "%~1"=="STAY" goto :main
cmd /k call "%~f0" STAY
exit /b
:main
title Arreter le detourage vgthmind
echo.
echo === Arret des anciens serveurs de detourage (port 7860) ===
echo.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":7860 " ^| findstr "LISTENING"') do (
  echo Arret du programme numero %%p qui occupe le port 7860...
  taskkill /F /PID %%p
)
taskkill /F /IM cloudflared.exe >nul 2>nul
echo.
netstat -ano | findstr ":7860 " | findstr "LISTENING" >nul
if errorlevel 1 (
  echo OK : le port 7860 est libre. Tu peux relancer Lancer-detourage.bat ou Lancer-detourage-iphone.bat.
) else (
  echo ATTENTION : le port 7860 est encore occupe. Ferme toutes les fenetres noires de detourage, ou redemarre le PC.
)
echo.
goto :eof
