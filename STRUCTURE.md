# Estrutura do Projeto Safe Atendimento Frontend

## 📂 Organização de Arquivos

```
Safe_Atendimento_Frontend-main/
│
├── 📄 Páginas HTML
│   ├── index.html           → Redirecionamento para pages/index.html
│   └── pages/               → Todas as páginas da aplicação
│       ├── index.html       → Autoatendimento (Totem)
│       ├── login.html       → Autenticação
│       ├── dashboard.html   → Dashboard principal
│       ├── atendente.html   → Painel do atendente
│       ├── medico.html      → Painel do médico
│       ├── painel.html      → Painel público
│       └── historico.html   → Histórico de atendimentos
│
├── 📁 assets/
│   └── images/              → Recursos visuais
│       ├── BG Vertical.jpg
│       ├── BG_Safemind5.png
│       ├── Logo Safe com slogan - Branco.png
│       └── Vector.svg
│
├── 📁 css/
│   └── style.css            → Estilos customizados e animações
│
├── 📁 js/
│   ├── index.js             → Lógica do autoatendimento
│   ├── login.js             → Lógica de autenticação
│   └── dashboard.js         → Lógica do dashboard
│
├── ⚙️ Configurações
│   ├── package.json         → Dependências e scripts
│   ├── tailwind.config.js   → Configuração do Tailwind CSS
│   ├── manifest.json        → Manifesto PWA
│   └── .gitignore           → Arquivos ignorados pelo Git
│
└── 📚 Documentação
    ├── README.md            → Documentação principal
    └── STRUCTURE.md         → Este arquivo
```

## 🔗 Fluxo de Navegação

```
index.html (raiz - redireciona)
    ↓
pages/index.html (Totem)
    ↓
pages/login.html
    ↓
pages/dashboard.html
    ├── → pages/atendente.html
    ├── → pages/medico.html
    ├── → pages/painel.html
    └── → pages/historico.html
```

## 🎨 Arquitetura de Estilos

- **Tailwind CSS** (CDN) - Framework utility-first
- **CSS Custom** (`css/style.css`) - Animações e estilos específicos
- **Inline Styles** - Apenas quando necessário para estados dinâmicos

## 💻 Arquitetura JavaScript

- **Vanilla JavaScript** - Sem frameworks
- **Módulos separados** - Um arquivo JS por página principal
- **APIs externas** - Conexão com backend no Railway

## 📦 Dependências Externas (CDN)

- Tailwind CSS v3
- Font Awesome 6.0.0
- Google Fonts (Inter)

## 🚀 Scripts Disponíveis

```bash
npm start    # Inicia servidor HTTP na porta 8000
npm run dev  # Alias para start
npm run serve # Alias para start
```

## 📍 Caminhos Relativos

Como as páginas estão em `pages/`, os caminhos relativos são:

- **JavaScript:** `../js/nome-arquivo.js`
- **CSS:** `../css/style.css`
- **Imagens:** `../assets/images/nome-imagem.jpg`
- **Links entre páginas:** `nome-pagina.html` (mesma pasta)
