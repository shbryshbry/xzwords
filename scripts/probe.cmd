@echo off
cd /d "%~dp0.."
set "ELECTRON_RUN_AS_NODE="
set "MOMO_SMOKE=1"
set "MOMO_PROBE=1"
"node_modules\electron\dist\electron.exe" . > "probe-console.txt" 2>&1
