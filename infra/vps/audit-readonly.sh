#!/bin/bash
# Auditoria READ-ONLY da VPS — CIA/Alpha 44
# Não altera, não instala, não para containers.
# Uso na VPS: bash audit-readonly.sh
# Ou remoto: ssh user@host 'bash -s' < audit-readonly.sh

set -euo pipefail

section() { echo ""; echo "========== $1 =========="; }

section "1. PORTAS (ss -tlnp)"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null || sudo ss -tlnp
else
  netstat -tlnp 2>/dev/null || sudo netstat -tlnp
fi
echo ""
echo "--- Classificação (manual no relatório) ---"
echo "EXPOSTO INTERNET = Listen 0.0.0.0:* ou [::]:*"
echo "SOMENTE LOCAL     = Listen 127.0.0.1:*"
echo "Bancos a checar: 5432 Postgres, 3306 MySQL, 27017 Mongo, 6379 Redis"

section "2. FIREWALL"
if command -v ufw >/dev/null 2>&1; then
  sudo ufw status verbose 2>/dev/null || ufw status verbose
else
  echo "ufw não instalado — iptables:"
  sudo iptables -L -n 2>/dev/null | head -80 || echo "(sem permissão iptables)"
fi

section "3. DOCKER"
if command -v docker >/dev/null 2>&1; then
  docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}" 2>/dev/null || sudo docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Ports}}"
else
  echo "Docker não instalado ou não acessível"
fi

section "4. PANORAMA GERAL"
echo "--- OS ---"
cat /etc/os-release 2>/dev/null || lsb_release -a 2>/dev/null || uname -a
echo ""
echo "--- Disco ---"
df -h
echo ""
echo "--- Memória ---"
free -h
echo ""
echo "--- Serviços systemd ativos (amostra) ---"
systemctl list-units --type=service --state=running 2>/dev/null | head -40 || true

section "5. SSH (sshd_config — sem segredos)"
CFG=/etc/ssh/sshd_config
if [ -r "$CFG" ]; then
  grep -E '^(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|Port)\b' "$CFG" 2>/dev/null \
    || grep -E '(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication|^Port)' "$CFG" 2>/dev/null
  echo "(valores efetivos podem estar em sshd_config.d/)"
  if [ -d /etc/ssh/sshd_config.d ]; then
    echo "--- sshd_config.d ---"
    grep -rhE '(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)' /etc/ssh/sshd_config.d/ 2>/dev/null || true
  fi
else
  echo "Não foi possível ler $CFG (rodar com sudo ou como root)"
  sudo grep -E '(PasswordAuthentication|PermitRootLogin|PubkeyAuthentication)' "$CFG" 2>/dev/null || true
fi

section "FIM DA AUDITORIA"
