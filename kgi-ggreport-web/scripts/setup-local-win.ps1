<#
  kgi-ggreport-web : local (out-local / MySQL) environment setup for Windows, NO admin rights needed.

  Installs everything as plain zip extracts under $DevRoot (default C:\dev):
    JDK 8 (Temurin) / MySQL 8.4 / IntelliJ IDEA (optional)
  Idempotent: anything already extracted or initialised is skipped, so re-running is safe.

  Usage (PowerShell 5.1, from kgi-ggreport-web\):
    .\scripts\setup-local-win.ps1                 # install + env vars + init MySQL data dir
    .\scripts\setup-local-win.ps1 -SkipIdea       # without IntelliJ (already installed)
    .\scripts\setup-local-win.ps1 -ApplySchema    # step 2: create tables + seeds (see README 5-2)

  Passwords are NEVER handled here. Create the DB user and register the password yourself
  (README 5-2 step 4-5); -ApplySchema reads it from the mysql login-path 'ggreport'.

  NOTE: keep this file ASCII. Windows PowerShell 5.1 misreads UTF-8 without BOM.
#>
param(
    [string]$DevRoot      = 'C:\dev',
    [string]$JdkUrl       = 'https://github.com/adoptium/temurin8-binaries/releases/download/jdk8u504-b01/OpenJDK8U-jdk_x64_windows_hotspot_8u504b01.zip',
    [string]$MysqlVersion = '8.4.13',
    [string]$IdeaUrl      = 'https://download.jetbrains.com/idea/idea-2025.3.win.zip',
    [switch]$SkipIdea,
    [switch]$ApplySchema
)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is ~10x faster without the progress bar

$dl      = Join-Path $DevRoot '_dl'
$mysqlZ  = "mysql-$MysqlVersion-winx64"
$mysqlHome = Join-Path $DevRoot "mysql\$mysqlZ"
$dataDir = Join-Path $DevRoot 'mysql-data'

function Get-Zip($url, $name) {
    $f = Join-Path $dl $name
    if (-not (Test-Path $f)) { Write-Host "download $name"; Invoke-WebRequest $url -OutFile $f }
    return $f
}
function Expand-Once($zip, $dest, $probe) {
    if (Test-Path $probe) { Write-Host "skip (exists): $dest"; return }
    New-Item -ItemType Directory -Force $dest | Out-Null
    Write-Host "extract $zip -> $dest"
    tar -xf $zip -C $dest            # bsdtar ships with Win10 1803+, far faster than Expand-Archive
}

# ---------------------------------------------------------------- step 2: schema
if ($ApplySchema) {
    $jdkHome = (Get-ChildItem (Join-Path $DevRoot 'jdk8') -Directory | Select-Object -First 1).FullName
    # mysql.exe loads its VC runtime DLLs from the JDK bin dir -> JDK must be on PATH first
    $env:Path = "$jdkHome\bin;$mysqlHome\bin;$env:Path"
    $sqlDir = Join-Path $PSScriptRoot '..\src\main\resources\db\mysql'
    $all = Join-Path $dl 'apply_all.sql'
    # 007 does not exist for MySQL (Oracle-only draft). Order matters.
    $files = '001','002','003','004','005','006','008','009','010','011','012','013'
    $q = "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ggreportdb' AND table_name='INSTITUTIONS'"
    $has = & mysql --login-path=ggreport -N -e $q
    if ($LASTEXITCODE -ne 0) { throw "mysql login failed: is the server running and login-path 'ggreport' registered? (README 5-2)" }
    if ([int]$has -gt 0) { Write-Host 'Schema already applied (INSTITUTIONS exists) - skipping. 002 is NOT re-runnable.'; return }
    Set-Content $all '' -Encoding UTF8
    foreach ($n in $files) {
        Get-Content (Get-ChildItem $sqlDir -Filter "${n}_*.sql").FullName -Raw -Encoding UTF8 | Add-Content $all -Encoding UTF8
    }
    # utf8mb4 is mandatory: the seeds contain Korean and the Windows console default is cp949 (ERROR 1366)
    & mysql --login-path=ggreport --default-character-set=utf8mb4 ggreportdb -e "source $($all -replace '\\','/')"
    if ($LASTEXITCODE -ne 0) { throw 'schema apply failed' }
    & mysql --login-path=ggreport -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ggreportdb'"
    Write-Host '^ expect 20 tables (INSTITUTIONS 25 rows, USERS 25 rows)'
    return
}

# ---------------------------------------------------------------- step 1: install
New-Item -ItemType Directory -Force $dl | Out-Null

$jdkZip = Get-Zip $JdkUrl 'jdk8.zip'
Expand-Once $jdkZip (Join-Path $DevRoot 'jdk8') (Join-Path $DevRoot 'jdk8\*\bin\java.exe')
$mysqlZip = Get-Zip "https://cdn.mysql.com/Downloads/MySQL-8.4/$mysqlZ.zip" 'mysql.zip'
Expand-Once $mysqlZip (Join-Path $DevRoot 'mysql') (Join-Path $mysqlHome 'bin\mysqld.exe')
if (-not $SkipIdea) {
    $ideaZip = Get-Zip $IdeaUrl 'idea.zip'     # ~1.5GB
    Expand-Once $ideaZip (Join-Path $DevRoot 'idea') (Join-Path $DevRoot 'idea\bin\idea64.exe')
}

$jdkHome = (Get-ChildItem (Join-Path $DevRoot 'jdk8') -Directory | Select-Object -First 1).FullName

# user-level env vars (takes effect in NEW terminals)
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkHome, 'User')
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
$add = @("$jdkHome\bin", "$mysqlHome\bin") | Where-Object { $path -notlike "*$_*" }
if ($add) { [Environment]::SetEnvironmentVariable('Path', (($path.TrimEnd(';') + ';' + ($add -join ';')).TrimStart(';')), 'User') }

# MySQL data dir: root has an EMPTY password until you set one (README 5-2)
if (-not (Test-Path (Join-Path $dataDir 'mysql'))) {
    New-Item -ItemType Directory -Force $dataDir | Out-Null
    $env:Path = "$jdkHome\bin;$env:Path"
    & "$mysqlHome\bin\mysqld.exe" --initialize-insecure "--basedir=$mysqlHome" "--datadir=$dataDir" --console
}

# server launcher: bound to 127.0.0.1 only, Xprotocol off, utf8mb4
$cmd = Join-Path $DevRoot 'mysql-start.cmd'
Set-Content $cmd -Encoding ASCII -Value @(
    '@echo off',
    "set PATH=$jdkHome\bin;%PATH%",
    "`"$mysqlHome\bin\mysqld.exe`" --basedir=$mysqlHome --datadir=$dataDir --bind-address=127.0.0.1 --mysqlx=OFF --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci --console"
)

Write-Host ''
Write-Host 'Done. Next (manual, see kgi-ggreport-web/README.md section 5-2):'
Write-Host "  1) open a NEW terminal and keep this running:  $cmd"
Write-Host '  2) create DB + user, register the password with mysql_config_editor'
Write-Host '  3) .\scripts\setup-local-win.ps1 -ApplySchema'
