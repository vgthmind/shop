@echo off
chcp 65001 >nul
title Serveur de detourage vgthmind
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
echo.
echo Serveur de detourage lance sur http://localhost:7860 - laisse cette fenetre ouverte pendant que tu utilises le studio photo.
echo Ferme la fenetre pour l'arreter.
echo.
node server.js
pause
