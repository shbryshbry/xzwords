@echo off
cd /d "%~dp0.."
set "ELECTRON_RUN_AS_NODE="
set E="node_modules\electron\dist\electron.exe"
echo [1 nosandbox] > diag.txt
%E% --no-sandbox --version >> diag.txt 2>&1
echo exit-%ERRORLEVEL% >> diag.txt
echo [2 disablegpu] >> diag.txt
%E% --disable-gpu --version >> diag.txt 2>&1
echo exit-%ERRORLEVEL% >> diag.txt
echo [3 enablelogging] >> diag.txt
%E% --enable-logging --v=1 --version >> diag.txt 2>&1
echo exit-%ERRORLEVEL% >> diag.txt
echo [4 singleproc] >> diag.txt
%E% --no-sandbox --disable-gpu --in-process-gpu --version >> diag.txt 2>&1
echo exit-%ERRORLEVEL% >> diag.txt
