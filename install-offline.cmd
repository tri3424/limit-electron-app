@echo off
setlocal
node scripts\install-offline.mjs
if errorlevel 1 exit /b %errorlevel%
echo Offline dependencies extracted. Now run: npm install ^&^& npm start
