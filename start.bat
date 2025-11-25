@echo off
echo Starting Reference Manager...
echo.

REM Start Python backend in a new window
start "Python Backend" cmd /k "python backend\main.py"

REM Wait a moment for backend to start
timeout /t 2 /nobreak

REM Start Electron app
npm run dev

pause
