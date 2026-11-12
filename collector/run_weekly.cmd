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
set RC_E=%ERRORLEVEL%
echo eminwon exit=%RC_E% >> "%LOG%"
echo [%TS%] g2b >> "%LOG%"
"C:\dev\python\python.exe" -m collector run --source g2b >> "%LOG%" 2>&1
set RC_G=%ERRORLEVEL%
echo g2b exit=%RC_G% >> "%LOG%"
rem Task Scheduler "Last Run Result" = worst of the two (qa P3-E).
rem rank: 0 ok < 4 other run in progress (skipped) < 3 new failure (results made) < 1, 2 or any other code
set R_E=3
if "%RC_E%"=="0" set R_E=0
if "%RC_E%"=="4" set R_E=1
if "%RC_E%"=="3" set R_E=2
set R_G=3
if "%RC_G%"=="0" set R_G=0
if "%RC_G%"=="4" set R_G=1
if "%RC_G%"=="3" set R_G=2
set FINAL=%RC_E%
if %R_G% GTR %R_E% set FINAL=%RC_G%
echo final exit=%FINAL% >> "%LOG%"
endlocal & exit /b %FINAL%
