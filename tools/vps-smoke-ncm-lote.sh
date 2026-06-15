#!/bin/bash
set -eu
cd /opt/cia-alpha44
set -a
source /etc/cia-alpha44/api.env
set +a

API="${SMOKE_API:-http://127.0.0.1:3333}"
PACKLISTE_COT="cmqb85m4e0001kwni2ko0m9r2"
CROSS_COT="cmqb8uowx0001kwgk87pyskr5"

MINT=$(node tools/mint-clerk-smoke-tokens.mjs --json-full)
BEARER_A=$(node -e "console.log(JSON.parse(process.argv[1]).tokens[0].token)" "$MINT")
export TENANT_A=$(node -e "console.log(JSON.parse(process.argv[1]).tokens[0].tenantSlug)" "$MINT")

echo "Tenant A: $TENANT_A"
echo "=== Reassign packliste cotacao -> tenant A (smoke temporario) ==="
TENANT_A="$TENANT_A" PACKLISTE_COT="$PACKLISTE_COT" node --input-type=module <<'NODE'
import { prisma } from "@cia/db";
const slug = process.env.TENANT_A;
const cotId = process.env.PACKLISTE_COT;
const tenant = await prisma.tenant.findUnique({ where: { slug } });
if (!tenant) throw new Error("tenant not found: " + slug);
await prisma.cotacao.update({ where: { id: cotId }, data: { tenantId: tenant.id } });
console.log("OK reassigned", cotId, "->", slug);
await prisma.$disconnect();
NODE

export SMOKE_COTACAO_CROSS_ID="$CROSS_COT"
python3 tools/smoke-confirmar-ncm-lote.py "$API" "$PACKLISTE_COT" "$BEARER_A"
SMOKE_EXIT=$?

echo ""
echo "=== Restore cotacao -> default tenant ==="
PACKLISTE_COT="$PACKLISTE_COT" node --input-type=module <<'NODE'
import { prisma } from "@cia/db";
const cotId = process.env.PACKLISTE_COT;
const def = await prisma.tenant.findUnique({ where: { slug: "default" } });
await prisma.cotacao.update({ where: { id: cotId }, data: { tenantId: def.id } });
console.log("OK restored", cotId, "-> default");
await prisma.$disconnect();
NODE

exit $SMOKE_EXIT
