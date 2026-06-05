# Postgres na VPS (Docker) — **opcional / dev**

> **Produção:** use Render Postgres via `render.yaml` (ver [docs/ECOSYSTEM.md](../../docs/ECOSYSTEM.md)).  
> Esta pasta serve para dev local com túnel SSH, se preferir não usar o banco do Render durante desenvolvimento.

## Pré-requisitos na VPS

- Docker Engine + plugin Docker Compose v2

## Subir o banco (na VPS)

```bash
cd /opt/cia-alpha44/infra/vps   # ou onde você copiar esta pasta
cp .env.example .env
# Edite .env e defina POSTGRES_PASSWORD (senha forte, 32+ caracteres)
docker compose up -d
docker compose ps
docker compose logs postgres --tail 20
```

## Conectar do seu PC (túnel SSH)

```bash
ssh -L 5432:127.0.0.1:5432 usuario@SUA_VPS
```

No `.env` local do projeto (raiz `cia-alpha44`, **não commitado**):

```
DATABASE_URL=postgresql://cia_app:SUA_SENHA@127.0.0.1:5432/cia_alpha44
```

## Parar / dados

- `docker compose stop` — para o container; **volume `cia_pg_data` mantém os dados**
- `docker compose down` — remove container; volume permanece
- `docker compose down -v` — **apaga todos os dados** (cuidado)

## Firewall

Não abra a porta 5432 no firewall público. O bind `127.0.0.1:5432` já restringe ao localhost da VPS.
