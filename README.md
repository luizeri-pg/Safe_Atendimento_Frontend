# Safe Atendimento - Frontend

Aplicação web frontend para o sistema Safe Atendimento, desenvolvida com HTML, CSS (Tailwind CSS) e JavaScript vanilla.

## 📁 Estrutura do Projeto

```
Safe_Atendimento_Frontend-main/
├── pages/                  # Páginas HTML da aplicação
│   ├── index.html          # Autoatendimento (Totem)
│   ├── login.html          # Página de login
│   ├── dashboard.html      # Dashboard principal
│   ├── atendente.html      # Interface do atendente
│   ├── medico.html         # Interface do médico
│   ├── painel.html         # Painel público de exibição
│   └── historico.html      # Histórico de atendimentos
├── assets/
│   └── images/             # Imagens e recursos visuais
│       ├── BG Vertical.jpg
│       ├── BG_Safemind5.png
│       ├── Logo Safe com slogan - Branco.png
│       └── Vector.svg
├── css/
│   └── style.css           # Estilos customizados e animações
├── js/
│   ├── index.js            # Lógica do autoatendimento (Totem)
│   ├── login.js            # Lógica de autenticação
│   └── dashboard.js        # Lógica do dashboard
├── manifest.json           # Manifesto PWA
├── package.json            # Dependências do projeto
└── tailwind.config.js      # Configuração do Tailwind CSS
```

## 🚀 Como Usar

### Desenvolvimento Local

1. **Instalar dependências (opcional):**
   ```bash
   npm install
   ```

2. **Iniciar servidor HTTP:**
   ```bash
   # Usando npm
   npm start
   
   # Ou usando Python diretamente
   python3 -m http.server 8000
   
   # Ou usando Node.js (se tiver http-server instalado)
   npx http-server -p 8000
   ```

3. **Acessar a aplicação:**
   - Página inicial: `http://localhost:8000/pages/index.html`
   - Login: `http://localhost:8000/pages/login.html`
   - Dashboard: `http://localhost:8000/pages/dashboard.html`

### Páginas Disponíveis

- **`pages/index.html`** - Autoatendimento (Totem) - Interface pública para geração de senhas
- **`pages/login.html`** - Sistema de autenticação (Médico/Atendente)
- **`pages/dashboard.html`** - Dashboard principal com estatísticas e ações rápidas
- **`pages/atendente.html`** - Painel do atendente para gerenciar filas
- **`pages/medico.html`** - Painel do médico para atendimentos
- **`pages/painel.html`** - Painel público para exibição de senhas
- **`pages/historico.html`** - Histórico de atendimentos

## 🛠️ Tecnologias Utilizadas

- **HTML5** - Estrutura das páginas
- **Tailwind CSS** - Framework CSS utility-first (via CDN)
- **JavaScript (Vanilla)** - Lógica da aplicação
- **Font Awesome** - Ícones
- **Google Fonts (Inter)** - Tipografia

## 📦 Dependências

Este projeto utiliza CDNs para as seguintes bibliotecas:

- Tailwind CSS (https://cdn.tailwindcss.com)
- Font Awesome 6.0.0 (https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css)
- Google Fonts - Inter (https://fonts.googleapis.com/css2?family=Inter)

## 🔌 API Backend

O frontend se conecta automaticamente ao backend:

- **Backend Local (desenvolvimento):** `http://localhost:3000/api` (quando acessado via localhost)
- **Backend Railway (produção):** `https://safeatendimento-production.up.railway.app/api`

A configuração é automática através do arquivo `js/config.js`.

### Endpoints principais:
  - `GET /api/soc` - Dados do SOC
  - `GET /api/senhas` - Lista de senhas
  - `POST /api/senhas` - Criar nova senha
  - `GET /api/senhas/recentes` - Senhas recentes
  - `/api/usuarios` - Gerenciamento de usuários

### Para rodar o backend localmente:
Veja o arquivo [BACKEND_SETUP.md](./BACKEND_SETUP.md) para instruções detalhadas.

## 🎨 Personalização

### Cores

As cores principais podem ser personalizadas no `tailwind.config.js`:

- **Primary:** Azul (#3b82f6, #1d4ed8)
- **Secondary:** Rosa (#EC297B)

### Estilos Customizados

Animações e estilos customizados estão em `css/style.css` ou inline nas páginas quando necessário para estados dinâmicos.

## 📝 Notas de Desenvolvimento

- O projeto foi refatorado para usar Tailwind CSS em vez de CSS inline
- JavaScript foi separado em arquivos modulares por página
- Imagens foram organizadas na pasta `assets/images/`
- Páginas HTML foram organizadas na pasta `pages/`
- Estrutura preparada para fácil manutenção e escalabilidade

## 🔒 Credenciais de Demonstração

**Médico:**
- Email: `medico@safe.com`
- Senha: `senha123`

**Atendente:**
- Email: `atendente@safe.com`
- Senha: `senha123`

## 📄 Licença

Este projeto faz parte do sistema Safe Atendimento.
