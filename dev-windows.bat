@echo off
echo.
echo  ==========================================
echo   NightReader - Windows Dev Mode
echo  ==========================================
echo.
echo  Starting development server...
echo  - Frontend: http://localhost:1420
echo  - App window opens automatically
echo.
echo  Hot-reload is active. Edit src/ files and the app updates instantly.
echo  Press Ctrl+C to stop.
echo.
call npm run tauri:dev
