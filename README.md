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

## Backend (Railway)

Para usar **front + back juntos no Railway** (e gerar um domínio `*.up.railway.app`), use o backend em `backend/` e rode pela raiz do repo:

- **Start (Railway)**: `npm start`
- **Domínio**: Settings → Domains → Generate Domain
- **Teste**: `https://SEU-DOMINIO.up.railway.app/health` (deve retornar `{ ok: true }`)
- **Banco (recomendado)**: adicione um **PostgreSQL** no Railway (isso cria `DATABASE_URL` e garante persistência do histórico)

- Como rodar e publicar no Railway: veja `backend/README.md`
- Como apontar o frontend para outra API (se necessário): use `js/config.js` (via `localStorage` ou `?apiBase=...`)
