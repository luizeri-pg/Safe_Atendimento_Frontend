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
- `POST /api/usuarios`
- `GET /api/exames/:senha`
- `POST /api/exames`
- `POST /api/encaminhamento`

## Rodar local

```bash
cd backend
npm install
npm run start
```

Backend local em `http://127.0.0.1:3000`.

## Deploy no Railway (gera o domínio automaticamente)

1. Suba este projeto para um repositório Git (ex.: GitHub).
2. No Railway: **New Project → Deploy from GitHub repo**.
3. Selecione o repositório.
4. Em **Settings** do serviço:
   - **Root Directory**: `backend`
   - **Start Command**: `npm run start`
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

