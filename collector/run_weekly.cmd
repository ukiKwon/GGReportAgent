@echo off
rem Weekly collector run (NEXT 80, user decision 2026-11-12). Registered in Windows Task Scheduler as "GGReport collector weekly".
rem Runs eminwon then g2b, writes only under data\collector\, log in data\collector\_logs\. No LLM call (no token cost).
rem Remove: schtasks /Delete /TN "GGReport collector weekly" /F
setlocal
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
if not exist "data\collector\_logs" mkdir "data\collector\_logs"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set TS=%%i
rem eminwon: only notices posted in the last 60 days (without --since every page back to 2009 is collected)
for /f %%i in ('powershell -NoProfile -Command "Get-Date (Get-Date).AddDays(-60) -Format yyyy-MM-dd"') do set SINCE=%%i
set LOG=data\collector\_logs\%TS%_weekly.log
echo [%TS%] eminwon >> "%LOG%"
"C:\dev\python\python.exe" -m collector run --source eminwon --since %SINCE% >> "%LOG%" 2>&1
echo eminwon exit=%ERRORLEVEL% >> "%LOG%"
echo [%TS%] g2b >> "%LOG%"
"C:\dev\python\python.exe" -m collector run --source g2b >> "%LOG%" 2>&1
echo g2b exit=%ERRORLEVEL% >> "%LOG%"
endlocal
