@echo off
cd /d "%~dp0.."
set "ELECTRON_RUN_AS_NODE="
set "MOMO_SMOKE=1"
"node_modules\electron\dist\electron.exe" --no-sandbox . > "smoke-console.txt" 2>&1
echo app-exit-%ERRORLEVEL% >> "smoke-console.txt"
