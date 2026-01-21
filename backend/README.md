# Safe Atendimento — Backend (Railway)

Este diretório contém um backend **Node.js/Express** mínimo, compatível com os endpoints que o frontend deste projeto chama.

## Endpoints

- `GET /health`
- `GET /api/soc` (retorna `[]` por padrão)
- `GET /api/senhas`
- `POST /api/senhas`
- `PATCH /api/senhas/:senha`
- `GET /api/senhas/recentes`
- `GET /api/senhas/historico`
- `POST /api/usuarios/login`
- `GET /api/usuarios`
- `GET /api/usuarios/:id` (id numérico ou e-mail)
- `PATCH /api/usuarios/:id` (perfil)
- `PATCH /api/usuarios/:id/senha`
- `POST /api/usuarios` (compat: cadastra/atualiza senha na fila)
- `GET /api/exames/:senha`
- `POST /api/exames`
- `POST /api/encaminhamento`

## Banco de dados

Por padrão o backend usa **SQLite** (arquivo local).

⚠️ **Atenção no Railway**: o arquivo SQLite pode **não ser persistente** entre deploys/restarts dependendo da configuração do serviço.  
Se você precisa “guardar tudo” com garantia de persistência, o recomendado é usar um banco gerenciado (ex.: Postgres).

## Rodar local

Recomendado usar Node.js **22.x** (ver `.nvmrc` / `.mise.toml` na raiz do repo).

### Opção A (recomendado): rodar pela raiz (serve front + back juntos)

```bash
npm install

npm run dev
```

Backend local em `http://127.0.0.1:3000`.

Se você quiser auto-reload, use:

```bash
npm run dev:watch
```

### Opção B: rodar só o backend (dentro de `backend/`)

```bash
cd backend
npm install
npm run dev
```

## Deploy no Railway (gera o domínio automaticamente)

1. Suba este projeto para um repositório Git (ex.: GitHub).
2. No Railway: **New Project → Deploy from GitHub repo**.
3. Selecione o repositório.
4. Adicione um **PostgreSQL**: **New → Database → Add PostgreSQL** (isso cria `DATABASE_URL`).
5. Em **Settings → Domains**, clique em **Generate Domain**.

Isso vai criar um domínio tipo `https://SEU-SERVICO.up.railway.app`.

## Apontar o frontend para o domínio do Railway

O frontend usa `config.js` e permite configurar a base da API:

No console do navegador:

```js
localStorage.setItem('SAFE_API_BASE', 'https://SEU-SERVICO.up.railway.app');
location.reload();
```

Ou por querystring:

`/index.html?apiBase=https://SEU-SERVICO.up.railway.app`

## Variáveis de ambiente (opcional)

- `PORT`: definido automaticamente no Railway.
- `SAFE_CORS_ORIGIN`: lista separada por vírgula (ex.: `http://127.0.0.1:8000,https://meu-front.com`).
- `DB_PATH`: caminho do SQLite (padrão `backend/data.sqlite`).

