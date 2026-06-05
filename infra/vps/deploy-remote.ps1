# Deploy Postgres na VPS via SSH (senha gerada só no .env remoto — nunca logada aqui).
# Uso:
#   $env:VPS_HOST="ip-ou-host"
#   $env:VPS_USER="root"
#   $env:VPS_PATH="/opt/cia-alpha44/infra/vps"
#   .\deploy-remote.ps1
#
# Requer: OpenSSH (ssh/scp) no PATH.

param(
  [string]$VpsHost = $env:VPS_HOST,
  [string]$User = $(if ($env:VPS_USER) { $env:VPS_USER } else { "root" }),
  [string]$RemotePath = $(if ($env:VPS_PATH) { $env:VPS_PATH } else { "/opt/cia-alpha44/infra/vps" })
)

$ErrorActionPreference = "Stop"
if (-not $VpsHost) {
  Write-Error "Defina VPS_HOST (ex.: `$env:VPS_HOST='203.0.113.10') antes de rodar."
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = "${User}@${VpsHost}"

Write-Host ">> Criando pasta remota $RemotePath ..."
ssh $target "mkdir -p '$RemotePath'"

Write-Host ">> Enviando docker-compose.yml e .env.example ..."
scp "$here\docker-compose.yml" "$here\.env.example" "${target}:${RemotePath}/"

Write-Host ">> Gerando senha e .env na VPS (valor NAO exibido) ..."
$genCmd = @'
cd REMOTE_PATH
PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)
cat > .env <<EOF
POSTGRES_USER=cia_app
POSTGRES_PASSWORD=${PASS}
POSTGRES_DB=cia_alpha44
EOF
chmod 600 .env
docker compose up -d
docker compose ps
docker inspect --format='{{.State.Health.Status}}' cia-postgres 2>/dev/null || true
'@ -replace 'REMOTE_PATH', $RemotePath

ssh $target $genCmd

Write-Host ">> Deploy concluido. Postgres deve estar healthy em alguns segundos."
Write-Host ">> Configure DATABASE_URL local via tunel SSH (senha esta no .env da VPS)."
