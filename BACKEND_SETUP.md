# 🚀 Como Rodar o Backend Localmente

Este guia mostra como rodar o backend localmente para desenvolvimento do frontend.

## 📋 Pré-requisitos

- Node.js instalado (versão 22 ou superior)
- npm ou yarn instalado
- Acesso ao repositório do backend (se tiver)

## 🔧 Configuração

### 1. Clonar o Repositório do Backend

Se você tem acesso ao repositório do backend:

```bash
# Exemplo (ajuste a URL do repositório)
git clone <url-do-repositorio-backend>
cd safe-atendimento-backend
```

### 2. Instalar Dependências

```bash
npm install
# ou
yarn install
```

### 3. Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto backend:

```env
PORT=3000
NODE_ENV=development
# Adicione outras variáveis de ambiente necessárias
```

### 4. Rodar o Backend

```bash
# Modo desenvolvimento
npm run dev
# ou
yarn dev

# Ou modo produção
npm start
# ou
yarn start
```

O backend deve estar rodando em `http://localhost:3000`

### 5. Verificar se o Backend está Funcionando

Teste os endpoints:

```bash
# Teste do endpoint SOC
curl http://localhost:3000/api/soc

# Teste do endpoint Senhas
curl http://localhost:3000/api/senhas
```

## 🔄 Configuração Automática do Frontend

O frontend já está configurado para usar automaticamente:
- **Backend local** (`http://localhost:3000/api`) quando acessado via `localhost`
- **Backend Railway** quando acessado via URL de produção

A configuração está no arquivo `js/config.js` e é carregada automaticamente.

## 🐛 Resolução de Problemas

### CORS Errors

Se você encontrar erros de CORS, certifique-se de que o backend está configurado para aceitar requisições de `http://localhost:8000`.

No backend Node.js/Express, adicione:

```javascript
const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:8000',
  credentials: true
}));
```

### Porta Diferente

Se o backend estiver rodando em uma porta diferente de 3000, edite o arquivo `js/config.js`:

```javascript
const API_BASE_URL = isLocalhost 
    ? 'http://localhost:SUA_PORTA/api'  // Altere SUA_PORTA
    : window.location.origin + '/api';
```

### Backend Não Inicia

1. Verifique se a porta 3000 está livre:
   ```bash
   lsof -i :3000
   # Se estiver em uso, mate o processo ou mude a porta
   ```

2. Verifique os logs de erro no terminal
3. Verifique se todas as dependências foram instaladas

## 📝 Estrutura Esperada da API

O backend deve expor os seguintes endpoints:

- `GET /api/soc` - Retorna lista de pacientes/consultas do SOC
- `GET /api/senhas` - Retorna lista de senhas
- `GET /api/senhas/recentes` - Retorna senhas recentes
- `POST /api/senhas` - Cria nova senha
- `PUT /api/senhas/:id` - Atualiza senha
- `DELETE /api/senhas/:id` - Deleta senha

## 🎯 Testando o Frontend com Backend Local

1. Inicie o backend local (porta 3000)
2. Inicie o servidor frontend (porta 8000):
   ```bash
   npm start
   # ou
   python3 -m http.server 8000
   ```
3. Acesse `http://localhost:8000/pages/dashboard.html`
4. O frontend deve se conectar automaticamente ao backend local

## 💡 Dica

Para verificar qual API está sendo usada, abra o console do navegador (F12) e procure pela mensagem:
```
🚀 API Config carregada: {...}
```



