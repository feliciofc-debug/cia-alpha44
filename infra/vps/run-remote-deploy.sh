#!/bin/bash
set -euo pipefail
VPS_ENV=""
if [[ -f /opt/cia-alpha44/infra/vps/.env ]]; then
  VPS_ENV=$(mktemp)
  cp /opt/cia-alpha44/infra/vps/.env "$VPS_ENV"
fi
if [[ ! -d /opt/cia-alpha44/.git ]]; then
  rm -rf /opt/cia-alpha44
  git clone https://github.com/feliciofc-debug/cia-alpha44.git /opt/cia-alpha44
fi
if [[ -n "$VPS_ENV" && -f "$VPS_ENV" ]]; then
  mkdir -p /opt/cia-alpha44/infra/vps
  cp "$VPS_ENV" /opt/cia-alpha44/infra/vps/.env
  chmod 600 /opt/cia-alpha44/infra/vps/.env
  rm -f "$VPS_ENV"
fi
cp /tmp/deploy-api.sh /tmp/set-claude-key.sh /tmp/cia-api.service /opt/cia-alpha44/infra/vps/
chmod +x /opt/cia-alpha44/infra/vps/deploy-api.sh /opt/cia-alpha44/infra/vps/set-claude-key.sh
bash /opt/cia-alpha44/infra/vps/deploy-api.sh
