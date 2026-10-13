@echo off
rem La fenetre reste TOUJOURS ouverte (cmd /k) : meme en cas d'erreur, tu peux lire le message.
if /i "%~1"=="STAY" goto :main
cmd /k call "%~f0" STAY
exit /b
:main
title Serveur de detourage vgthmind
cd /d "%~dp0"
echo.
echo === Serveur de detourage vgthmind ===
where node >nul 2>nul
if errorlevel 1 goto :nonode
if exist node_modules goto :modele
echo Premiere installation, quelques minutes...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 goto :echecnpm
:modele
if exist models\model.onnx goto :lancer
echo Telechargement du modele, 224 Mo, une seule fois...
if not exist models mkdir models
curl.exe -L -f -o models\model.onnx https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx
if errorlevel 1 goto :echecmodele
:lancer
echo.
echo Serveur de detourage sur http://localhost:7860
echo LAISSE CETTE FENETRE OUVERTE pendant que tu utilises le studio photo. Ferme-la pour arreter.
echo Si un message ERREUR apparait ci-dessous, lis-le : il dit quoi faire.
echo.
node server.js
echo.
echo Le serveur s'est arrete (code %errorlevel%). Lis le message juste au-dessus.
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
