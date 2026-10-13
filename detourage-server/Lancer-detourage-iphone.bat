@echo off
rem La fenetre reste TOUJOURS ouverte (cmd /k) : meme en cas d'erreur, tu peux lire le message.
if /i "%~1"=="STAY" goto :main
cmd /k call "%~f0" STAY
exit /b
:main
title Detourage iPhone vgthmind
cd /d "%~dp0"
echo.
echo === Detourage iPhone vgthmind ===
where node >nul 2>nul
if errorlevel 1 goto :nonode
if exist node_modules goto :modele
echo Premiere installation, quelques minutes...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :echecnpm
:modele
if exist models\model.onnx goto :tunnel
echo Telechargement du modele, 224 Mo, une seule fois...
if not exist models mkdir models
curl.exe -L -f -o models\model.onnx https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx
if errorlevel 1 goto :echecmodele
:tunnel
if exist cloudflared.exe goto :lancer
echo Telechargement de cloudflared (55 Mo) depuis le site officiel de Cloudflare, une seule fois...
curl.exe -L -f -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
if errorlevel 1 goto :echectunnel
:lancer
echo.
echo Lancement du serveur de detourage et du tunnel. Patiente quelques secondes...
echo LAISSE CETTE FENETRE OUVERTE pendant que tu utilises le studio sur l'iPhone. Ferme-la pour tout arreter.
echo.
node tunnel.js
echo.
echo C'est arrete (code %errorlevel%). Lis le message juste au-dessus.
echo Si on parle du port 7860 : double-clique sur Arreter-detourage.bat puis relance ce fichier.
goto :eof
:nonode
echo ERREUR : Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance ce fichier.
goto :eof
:echecnpm
echo ERREUR : l'installation (npm install) a echoue. Verifie la connexion internet puis relance.
goto :eof
:echecmodele
echo ERREUR : le telechargement du modele a echoue. Verifie la connexion internet puis relance.
del models\model.onnx 2>nul
goto :eof
:echectunnel
echo ERREUR : le telechargement de cloudflared a echoue. Verifie la connexion internet puis relance.
del cloudflared.exe 2>nul
goto :eof
