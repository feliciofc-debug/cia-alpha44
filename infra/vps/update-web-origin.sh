#!/bin/bash
set -euo pipefail
ENV_API="/etc/cia-alpha44/api.env"
ORIGIN="${1:?Usage: update-web-origin.sh https://your-site.vercel.app}"
TMP=$(mktemp)
grep -v '^WEB_ORIGIN=' "$ENV_API" > "$TMP"
printf 'WEB_ORIGIN=%s\n' "$ORIGIN" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_API"
systemctl restart cia-api
echo "WEB_ORIGIN atualizado para: $ORIGIN"
