# ffclavicule : installe ce qu'il faut pour streamer FFXIV de ton PC vers un navigateur.
# A lancer dans PowerShell (pas besoin d'être administrateur, winget demandera si besoin).
#   powershell -ExecutionPolicy Bypass -File .\scripts\install.ps1

$ErrorActionPreference = 'Stop'

$MoonlightWebVersion = 'v2.10.0'
$ArchiveName = 'moonlight-web-x86_64-pc-windows-gnu.zip'
$InstallDir = Join-Path $env:LOCALAPPDATA 'ffclavicule\moonlight-web'
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host '1/3 Sunshine (capture et encodage de l''écran)'
winget install --id LizardByte.Sunshine -e --accept-source-agreements --accept-package-agreements

Write-Host '2/3 Tailscale (réseau privé pour jouer hors de chez toi sans ouvrir de port)'
winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements

Write-Host "3/3 Moonlight Web Stream $MoonlightWebVersion (client navigateur pour Sunshine)"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
$zip = Join-Path $env:TEMP $ArchiveName
$url = "https://github.com/MrCreativ3001/moonlight-web-stream/releases/download/$MoonlightWebVersion/$ArchiveName"
Invoke-WebRequest -Uri $url -OutFile $zip
Expand-Archive -Path $zip -DestinationPath $InstallDir -Force
Remove-Item $zip

# Copie la config d'exemple à côté du serveur, sans écraser une config existante.
$server = Get-ChildItem -Path $InstallDir -Recurse -Filter 'web-server.exe' | Select-Object -First 1
if (-not $server) { throw "web-server.exe introuvable dans $InstallDir" }
$serverDir = Join-Path $server.DirectoryName 'server'
New-Item -ItemType Directory -Force -Path $serverDir | Out-Null
$config = Join-Path $serverDir 'config.json'
if (-not (Test-Path $config)) {
    Copy-Item (Join-Path $RepoRoot 'config\config.example.json') $config
}

Write-Host ''
Write-Host "Installé dans $InstallDir"
Write-Host 'Suite : ouvre https://localhost:47990 pour créer ton compte Sunshine, puis lance scripts\start.ps1'
