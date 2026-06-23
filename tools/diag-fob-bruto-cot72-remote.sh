#!/bin/bash
set -euo pipefail
set -a
source /etc/cia-alpha44/api.env
set +a
cd /opt/cia-alpha44
node tools/diag-fob-bruto-cot72.mjs "$@"
