# ffclavicule : démarre le client web et le publie en HTTPS sur ton réseau Tailscale.
#   powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1

$ErrorActionPreference = 'Stop'

$InstallDir = Join-Path $env:LOCALAPPDATA 'ffclavicule\moonlight-web'
$server = Get-ChildItem -Path $InstallDir -Recurse -Filter 'web-server.exe' | Select-Object -First 1
if (-not $server) { throw 'Moonlight Web Stream absent : lance d''abord scripts\install.ps1' }

# HTTPS est requis pour la manette et la capture complète du clavier dans le navigateur.
# "tailscale serve" fournit un vrai certificat, visible uniquement sur tes appareils Tailscale.
tailscale serve --bg http://127.0.0.1:8080

Write-Host 'Adresse à ouvrir depuis tes autres appareils :'
tailscale serve status

Set-Location $server.DirectoryName
& $server.FullName
