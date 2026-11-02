<#
  kgi-ggreport-web : local (out-local / MySQL) environment setup for Windows, NO admin rights needed.

  Installs everything as plain zip extracts under $DevRoot (default C:\dev):
    JDK 8 (Temurin) / MySQL 8.4 / IntelliJ IDEA (optional)
  Idempotent: anything already extracted or initialised is skipped, so re-running is safe.

  Usage (PowerShell 5.1, from kgi-ggreport-web\):
    .\scripts\setup-local-win.ps1                 # install + env vars + init MySQL data dir
    .\scripts\setup-local-win.ps1 -SkipIdea       # without IntelliJ (already installed)
    .\scripts\setup-local-win.ps1 -ApplySchema    # step 2: create tables + seeds (see README 5-2); re-run later to add new scripts (014+)

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
    [switch]$SkipGh,        # GitHub CLI (needed only to open PRs from the terminal)
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
# Run a native exe WITHOUT treating its stderr as a terminating error.
# PS 5.1 + $ErrorActionPreference='Stop' turns every stderr line into NativeCommandError when the
# host output is redirected (agent / IDE), and mysqld --console logs even [System] lines to stderr.
# Success is decided by $LASTEXITCODE only. stderr lines are echoed to the host, stdout is returned.
function Invoke-Native([string]$Exe, [string[]]$ArgList) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Exe @ArgList 2>&1 | ForEach-Object {
            if ($_ -is [System.Management.Automation.ErrorRecord]) { Write-Host $_.ToString() } else { $_ }
        }
    } finally { $ErrorActionPreference = $old }
}

# ---------------------------------------------------------------- step 2: schema
if ($ApplySchema) {
    $jdkHome = (Get-ChildItem (Join-Path $DevRoot 'jdk8') -Directory | Select-Object -First 1).FullName
    # mysql.exe loads its VC runtime DLLs from the JDK bin dir -> JDK must be on PATH first
    $env:Path = "$jdkHome\bin;$mysqlHome\bin;$env:Path"
    $sqlDir = (Resolve-Path (Join-Path $PSScriptRoot '..\src\main\resources\db\mysql')).Path
    $all = Join-Path $dl 'apply_all.sql'
    # Base chain, applied together on an empty DB. 007 does not exist for MySQL (Oracle-only draft).
    # Order matters. NOT re-runnable (002).
    $base = '001','002','003','004','005','006','008','009','010','011','012','013'
    # Scripts added after the base chain: file number -> one table it creates (the probe).
    # Each is applied on its own if its table is missing. Append new ones here, in order.
    $later = [ordered]@{ '014' = 'BOARD_FORM' }

    function Test-Table([string]$t) {
        $r = Invoke-Native 'mysql' @('--login-path=ggreport', '-N', '-e',
            "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ggreportdb' AND table_name='$t'")
        if ($LASTEXITCODE -ne 0) { throw "mysql login failed: is the server running and login-path 'ggreport' registered? (README 5-2)" }
        return ([int]($r | Select-Object -Last 1) -gt 0)
    }

    $todo = @()
    $fresh = -not (Test-Table 'INSTITUTIONS')
    if ($fresh) {
        $todo += $base
    } else {
        if (-not (Test-Table 'APPROVAL_REQUEST')) {
            throw 'INSTITUTIONS exists but APPROVAL_REQUEST (012) does not: the base chain is half-applied. Continue by hand from the next file (README 5-2, pitfall on 002).'
        }
        Write-Host 'Base chain 001-013 already applied - skipping it (002 is NOT re-runnable).'
    }
    foreach ($n in $later.Keys) {
        if ((-not $fresh) -and (Test-Table $later[$n])) { Write-Host "skip (exists): $n ($($later[$n]))" }
        else { $todo += $n }
    }

    if ($todo.Count -eq 0) {
        Write-Host 'Nothing to apply - schema is up to date.'
    } else {
        Write-Host ('apply: ' + ($todo -join ' '))
        Set-Content $all '' -Encoding UTF8
        foreach ($n in $todo) {
            Get-Content (Get-ChildItem $sqlDir -Filter "${n}_*.sql").FullName -Raw -Encoding UTF8 | Add-Content $all -Encoding UTF8
        }
        # utf8mb4 is mandatory: the seeds contain Korean and the Windows console default is cp949 (ERROR 1366)
        Invoke-Native 'mysql' @('--login-path=ggreport', '--default-character-set=utf8mb4', 'ggreportdb', '-e', "source $($all -replace '\\','/')")
        if ($LASTEXITCODE -ne 0) { throw 'schema apply failed (see above). 002 and 014 are NOT re-runnable: check which tables exist before re-running.' }
    }
    Invoke-Native 'mysql' @('--login-path=ggreport', '-N', '-e',
        "SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='ggreportdb'), (SELECT COUNT(*) FROM ggreportdb.INSTITUTIONS), (SELECT COUNT(*) FROM ggreportdb.USERS)")
    Write-Host '^ expect: 23 tables / INSTITUTIONS 25 rows / USERS 25 rows'
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

$ghBin = Join-Path $DevRoot 'gh\bin'
if (-not $SkipGh) {
    if (-not (Test-Path "$ghBin\gh.exe")) {
        $rel = Invoke-RestMethod 'https://api.github.com/repos/cli/cli/releases/latest'
        $asset = $rel.assets | Where-Object name -match 'windows_amd64\.zip$' | Select-Object -First 1
        $ghZip = Get-Zip $asset.browser_download_url 'gh.zip'
        Expand-Once $ghZip (Join-Path $DevRoot 'gh') "$ghBin\gh.exe"
    } else { Write-Host 'skip (exists): gh' }
}

$jdkHome = (Get-ChildItem (Join-Path $DevRoot 'jdk8') -Directory | Select-Object -First 1).FullName

# user-level env vars (takes effect in NEW terminals)
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkHome, 'User')
$path = [Environment]::GetEnvironmentVariable('Path', 'User')
$pathAdd = @("$jdkHome\bin", "$mysqlHome\bin"); if (-not $SkipGh) { $pathAdd += $ghBin }
$add = $pathAdd | Where-Object { $path -notlike "*$_*" }
if ($add) { [Environment]::SetEnvironmentVariable('Path', (($path.TrimEnd(';') + ';' + ($add -join ';')).TrimStart(';')), 'User') }

# MySQL data dir: root has an EMPTY password until you set one (README 5-2)
# A finished init leaves a marker NEXT TO the data dir (never inside it: mysqld treats sub-folders as schemas).
$initOk = "$dataDir.initialized"
$dataItems = @(if (Test-Path $dataDir) { Get-ChildItem $dataDir -Force })
if (Test-Path $initOk) {
    Write-Host "skip (initialised): $dataDir"
} elseif (($dataItems.Count -gt 0) -and (Test-Path (Join-Path $dataDir 'ggreportdb'))) {
    # initialised by an older version of this script and already in use -> keep it, just add the marker
    Set-Content $initOk (Get-Date -Format s) -Encoding ASCII
    Write-Host "keep (in use, ggreportdb exists): $dataDir"
} else {
    if ($dataItems.Count -gt 0) {
        # non-empty, no marker, no ggreportdb -> an interrupted --initialize. mysqld refuses a
        # non-empty datadir, so move it aside (kept for inspection; delete it yourself later).
        if (Get-Process mysqld -ErrorAction SilentlyContinue) {
            throw "a mysqld process is running - stop it first, then re-run ($dataDir looks half-initialised)"
        }
        $bad = "$dataDir.broken-$(Get-Date -Format yyyyMMddHHmmss)"
        Move-Item $dataDir $bad
        Write-Host "incomplete data dir moved aside -> $bad"
    }
    New-Item -ItemType Directory -Force $dataDir | Out-Null
    $env:Path = "$jdkHome\bin;$env:Path"
    Invoke-Native "$mysqlHome\bin\mysqld.exe" @('--initialize-insecure', "--basedir=$mysqlHome", "--datadir=$dataDir", '--console')
    if ($LASTEXITCODE -ne 0) { throw "mysqld --initialize-insecure failed (exit $LASTEXITCODE) - see the log above. Re-running moves the partial data dir aside." }
    if (-not ((Test-Path (Join-Path $dataDir 'mysql.ibd')) -and (Test-Path (Join-Path $dataDir 'sys')))) {
        throw "mysqld exited 0 but $dataDir has no mysql.ibd / sys - initialisation is incomplete"
    }
    Set-Content $initOk (Get-Date -Format s) -Encoding ASCII
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
if (-not $SkipGh) { Write-Host '  4) (optional) gh auth login   # fine-grained token needs Contents + Pull requests: Read and write' }
