# ID: **Sistema Painel**

# Safe Atendimento (apps/frontend + apps/backend)

Monorepo com:

- `apps/frontend`: React + Vite
- `apps/backend`: Node.js/Express + Socket.IO (serve o build do frontend em produção)

## Rodar local (dev)

Pré-requisito: Node.js **22.x**.

```bash
npm install
npm run dev
```

- Front (dev): `http://localhost:5173`
- Backend: `http://localhost:3000/health`

## Variáveis de ambiente

Crie `.env` na raiz (sem aspas e sem caracteres estranhos):

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (recomendado para o Totem “entrar direto na fila” quando encontra no SOC)
- `SAFE_CORS_ORIGIN` (opcional, vírgula separado)
- `SOC_*` (opcional, integração SOC)

## Deploy no Railway (um único serviço)

Este repo já inclui `railway.toml`.

- **Build**: `npm run build`
- **Start**: `npm run start`
- **Healthcheck**: `/health`

No Railway, configure as variáveis de ambiente do Supabase (e SOC se usar).
