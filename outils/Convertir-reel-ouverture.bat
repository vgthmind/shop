@echo off
rem Glisse un reel (MP4) sur ce fichier : cree a cote un clip leger pour l ecran d ouverture du site (3 s, 480 px, H.264, sans son).
rem Ensuite : admin > Videos d ouverture > Ajouter. Necessite ffmpeg (winget install Gyan.FFmpeg).
if "%~1"=="" (
  echo Glisse un fichier MP4 sur ce .bat.
  pause
  exit /b
)
ffmpeg -y -i "%~1" -t 3 -vf "scale=480:-2,fps=30" -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 27 -preset slow -an -movflags +faststart "%~dpn1-ouverture.mp4"
echo.
echo Termine : %~dpn1-ouverture.mp4
pause
