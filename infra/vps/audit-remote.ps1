# Executa auditoria read-only na VPS via SSH (saída para colar no relatório).
# Uso:
#   $env:VPS_HOST="seu-ip"
#   $env:VPS_USER="root"
#   .\audit-remote.ps1

param(
  [string]$VpsHost = $env:VPS_HOST,
  [string]$User = $(if ($env:VPS_USER) { $env:VPS_USER } else { "root" })
)

$ErrorActionPreference = "Stop"
if (-not $VpsHost) { Write-Error "Defina VPS_HOST" }

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = "${User}@${VpsHost}"

Write-Host ">> Auditoria read-only em $target ..."
Get-Content "$here\audit-readonly.sh" -Raw | ssh $target "bash -s"
