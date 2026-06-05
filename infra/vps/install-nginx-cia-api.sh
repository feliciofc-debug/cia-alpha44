#!/bin/bash
# Insere proxy HTTPS /cia/ → :3333 no server api2.amzofertas.com.br
set -euo pipefail

CONF="/etc/nginx/sites-available/wuzapi"
MARKER="# CIA Alpha 44 API"

if grep -q "$MARKER" "$CONF"; then
  echo "Nginx CIA API já configurado."
else
  TMP=$(mktemp)
  awk '
    /# === WuzAPI \(WhatsApp\) — porta 8081 ===/ { print; next }
    /location \/ \{/ && !done {
      print "    # CIA Alpha 44 API (Fastify :3333) — HTTPS via api2.amzofertas.com.br/cia/"
      print "    location /cia/ {"
      print "        proxy_pass http://127.0.0.1:3333/;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_connect_timeout 120;"
      print "        proxy_send_timeout 120;"
      print "        proxy_read_timeout 120;"
      print "        client_max_body_size 30M;"
      print "    }"
      print ""
      done=1
    }
    { print }
  ' "$CONF" > "$TMP"
  mv "$TMP" "$CONF"
  echo "Bloco /cia/ adicionado em $CONF"
fi

nginx -t
systemctl reload nginx
echo "OK: https://api2.amzofertas.com.br/cia/api/health"
