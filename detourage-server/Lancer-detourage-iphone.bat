@echo off
chcp 65001 >nul
title Detourage iPhone vgthmind
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance. & pause & exit /b 1)
if not exist node_modules (
  echo Premiere installation, quelques minutes...
  call npm install --omit=dev --no-audit --no-fund || (echo Echec de npm install. & pause & exit /b 1)
)
if not exist models\model.onnx (
  echo Telechargement du modele, 224 Mo, une seule fois...
  if not exist models mkdir models
  curl.exe -L -f -o models\model.onnx https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx || (echo Echec du telechargement. & del models\model.onnx 2>nul & pause & exit /b 1)
)
if not exist cloudflared.exe (
  echo Telechargement de cloudflared (55 Mo) depuis le site officiel de Cloudflare, une seule fois...
  curl.exe -L -f -o cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe || (echo Echec du telechargement. & del cloudflared.exe 2>nul & pause & exit /b 1)
)
echo.
echo Lancement du serveur de detourage et du tunnel. Patiente quelques secondes...
echo Laisse cette fenetre ouverte pendant que tu utilises le studio sur l'iPhone. Ferme-la pour tout arreter.
echo.
node tunnel.js
pause
