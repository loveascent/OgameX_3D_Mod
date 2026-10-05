@echo off
rem celestia2 lokal ansehen: Server starten und Chrome auf der NVIDIA-Karte oeffnen (eigenes Profil, damit die GPU-Option greift).
cd /d "%~dp0"
start "celestia2-Server" /min node server.mjs
timeout /t 1 >nul
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --force_high_performance_gpu --user-data-dir="%TEMP%\celestia2-chrome" --new-window http://localhost:8290/OgameX_3D_Mod/celestia2/
