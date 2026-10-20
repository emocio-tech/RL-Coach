# Downloads rrrocket.exe into backend/bin/ (ignored by Git). Safe to re-run.
param([switch]$Force)

$ErrorActionPreference = "Stop"

$version = "0.11.8"
$asset = "rrrocket-$version-x86_64-pc-windows-msvc.zip"
$url = "https://github.com/nickbabcock/rrrocket/releases/download/v$version/$asset"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "backend\bin"
$target = Join-Path $binDir "rrrocket.exe"

if ((Test-Path $target) -and -not $Force) {
    Write-Host "rrrocket.exe already present: $target (use -Force to replace)"
    exit 0
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) "rrrocket-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    $zip = Join-Path $tmp $asset
    Write-Host "Downloading $url"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $tmp -Force

    $exe = Get-ChildItem -Path $tmp -Filter "rrrocket.exe" -Recurse | Select-Object -First 1
    if (-not $exe) { throw "rrrocket.exe not found in $asset" }

    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
    Copy-Item -Path $exe.FullName -Destination $target -Force
    Write-Host "Installed: $target"
}
finally {
    Remove-Item -Path $tmp -Recurse -Force -ErrorAction SilentlyContinue
}
