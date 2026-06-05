# Ecossistema CIA / Alpha 44

Stack oficial de produção — sem gambiarras, pronto para escalar.

```
GitHub (código + CI)
    │
    ├── Vercel ──────────► Site React (domínio apresentável)
    │                           │
    │                           │ HTTPS  /api/*
    │                           ▼
    └── Render ──────────► API Fastify (Node)
              │
              └── Render Postgres (cotações, tenants, itens)
```

A VPS (`api2`) fica opcional para **dev local** ou túnel ao banco; **produção = Render + Vercel + GitHub**.

---

## 1. GitHub

| Função | Detalhe |
|--------|---------|
| Repositório | Fonte única da verdade |
| CI | `.github/workflows/ci.yml` — testes do motor + build API/web em cada PR |
| Deploy | Push em `main` dispara Vercel e Render (auto-deploy ligado em cada painel) |

### Primeiro push

```bash
git remote add origin git@github.com:SEU_USUARIO/cia-alpha44.git
git push -u origin main
```

---

## 2. Render (API + Postgres)

### Provisionar via Blueprint

1. [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
2. Conecte o repo GitHub `cia-alpha44`
3. Render lê `render.yaml` e cria:
   - **cia-alpha44-db** — PostgreSQL
   - **cia-alpha44-api** — Web Service Node

### Variáveis no painel da API (obrigatórias)

| Variável | Valor |
|----------|-------|
| `ANTHROPIC_API_KEY` | Sua chave (testes) → chave do cliente (produção) |
| `WEB_ORIGIN` | URL do site na Vercel, ex. `https://cotacao.seudominio.com.br` |

Várias origens (preview Vercel + produção): separar por vírgula.

`DATABASE_URL` é injetada automaticamente pelo Postgres do Render.

### Domínio da API (opcional)

Render → **cia-alpha44-api** → **Settings** → **Custom Domain**  
Ex.: `api.seudominio.com.br` (CNAME no DNS).

### Seed (uma vez, após primeiro deploy)

```bash
# Com DATABASE_URL do painel Render no ambiente local:
npm run db:seed -w @cia/db
```

### Health check

`GET https://cia-alpha44-api.onrender.com/api/health`

---

## 3. Vercel (frontend)

### Conectar projeto

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → repo GitHub
2. **Root Directory:** deixe na **raiz** do monorepo (o `vercel.json` já aponta para `apps/web/dist`)
3. Framework: Vite (detectado automaticamente)

### Variável de ambiente

| Variável | Valor |
|----------|-------|
| `VITE_API_URL` | URL pública da API Render, ex. `https://api.seudominio.com.br` |

**Sem barra no final.** O frontend chama `${VITE_API_URL}/api/...`.

### Domínio apresentável

Vercel → **Settings** → **Domains** → adicionar `cotacao.seudominio.com.br` (ou o que preferir).  
O cliente acessa esse endereço no navegador.

---

## 4. Autenticação (próximo passo — produção)

O login atual é **demo** (`localStorage`, sem validação). Para entregar ao cliente:

| Camada | Solução recomendada |
|--------|---------------------|
| Login | **Clerk** (ou Auth.js) |
| Vercel | `VITE_CLERK_PUBLISHABLE_KEY` |
| API | validação JWT / middleware Clerk |

Estrutura em `apps/web/src/auth/` já isolada para trocar sem refazer telas.

---

## 5. Ambientes

| Ambiente | Web | API | Banco |
|----------|-----|-----|-------|
| **Local** | `localhost:5173` | `localhost:3333` | VPS túnel ou Render URL |
| **Preview** | `*.vercel.app` | Render (mesma API ou staging) | Render |
| **Produção** | domínio custom Vercel | domínio custom Render | Render Postgres |

Para escalar a vários clientes depois: multi-tenant já no schema (`tenantId`); novos tenants = dados no mesmo Postgres, sem novo servidor.

---

## 6. Checklist de go-live

- [ ] Repo no GitHub, CI verde
- [ ] Blueprint Render aplicado, `/api/health` OK
- [ ] `WEB_ORIGIN` = URL Vercel produção
- [ ] Vercel deploy OK, `VITE_API_URL` = URL API
- [ ] Domínios custom (web + api) no DNS
- [ ] `db:seed` rodado uma vez
- [ ] Chave Claude do cliente em `ANTHROPIC_API_KEY`
- [ ] Auth real (Clerk) antes de entregar login ao cliente

---

## 7. Comandos locais

```bash
npm install
npm run engine:test      # selo planilha 66 (14 testes)
npm run build:api
npm run build:web
npm run dev -w @cia/api    # API :3333
npm run dev -w @cia/web    # Web :5173
```
