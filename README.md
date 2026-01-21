# Safe Atendimento — Frontend + Backend

Aplicação web para o sistema Safe Atendimento.

Agora o projeto suporta **rodar frontend e backend no mesmo serviço** (ideal para Railway): o backend serve os arquivos de `pages/` e expõe a API em `/api/*`.

## Estrutura

- `index.html` - Página inicial
- `login.html` - Página de login
- `dashboard.html` - Dashboard principal
- `atendente.html` - Interface do atendente
- `medico.html` - Interface do médico
- `painel.html` - Painel de controle
- `historico.html` - Histórico de atendimentos

## Como usar

Abra os arquivos HTML diretamente no navegador ou configure um servidor web local.

## Rodar local (recomendado)

### Configurar Supabase (.env) (opcional para testar)

Se você quiser testar o frontend usando Supabase em localhost:

1. Copie `ENV.example` para `.env` na raiz do repo
2. Preencha:
   - `SUPABASE_URL` (se necessário)
   - `SUPABASE_ANON_KEY`

O backend local lê esse `.env` usando `node --env-file=.env` e expõe os valores (somente `SUPABASE_URL` e `SUPABASE_ANON_KEY`) para o browser via `GET /js/supabaseEnv.js`.

### Pré-requisitos

- Node.js **22.x** (o projeto inclui `.nvmrc` e `.mise.toml`)

Se você usa `nvm`:

```bash
nvm install
nvm use
```

Se você usa `mise`:

```bash
mise install
```

### Subir o serviço (backend + frontend no mesmo servidor)

Na raiz do repositório:

```bash
npm install
npm run dev
```

- **Frontend**: `http://localhost:3000/pages/index.html`
- **Health**: `http://localhost:3000/health`
- **API**: `http://localhost:3000/api/*`

Se você quiser auto-reload, use:

```bash
npm run dev:watch
```

### Frontend separado (opcional)

Se você quiser servir apenas os HTML/JS por outra porta:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000/pages/index.html`.  
O frontend em localhost já aponta a API para `http://localhost:3000/api` automaticamente (via `js/config.js`).

## Backend (Railway)

Para usar **front + back juntos no Railway** (e gerar um domínio `*.up.railway.app`), use o backend em `backend/` e rode pela raiz do repo:

- **Start (Railway)**: `npm start`
- **Domínio**: Settings → Domains → Generate Domain
- **Teste**: `https://SEU-DOMINIO.up.railway.app/health` (deve retornar `{ ok: true }`)
- **Banco (padrão)**: SQLite (arquivo local).
  - **Importante**: no Railway, SQLite pode não ser persistente entre deploys/restarts. Se precisar “guardar tudo” com garantia, use Postgres.

- Como rodar e publicar no Railway: veja `backend/README.md`
- Como apontar o frontend para outra API (se necessário): use `js/config.js` (via `localStorage` ou `?apiBase=...`)
