# 📋 Checklist para Deploy em Produção

## ✅ O que já está pronto

- [x] Código refatorado para Tailwind CSS
- [x] Configuração automática de API (localhost vs produção)
- [x] Estrutura de arquivos organizada
- [x] Backend configurado no Railway
- [x] Sistema de autenticação básico
- [x] Fluxo completo de atendimento implementado

---

## 🔴 Itens Críticos para Produção

### 1. **Configuração de Hosting/Deploy**

#### Opções de Deploy:
- [ ] **Netlify** (recomendado - fácil e gratuito)
- [ ] **Vercel** (recomendado - fácil e gratuito)
- [ ] **GitHub Pages** (gratuito, mas limitado)
- [ ] **Railway** (mesmo provider do backend)
- [ ] **AWS S3 + CloudFront**
- [ ] **Servidor próprio**

#### Arquivos necessários:
- [ ] Criar `netlify.toml` ou `vercel.json` (se usar esses serviços)
- [ ] Configurar `_redirects` para SPA (se necessário)
- [ ] Configurar domínio customizado

---

### 2. **Variáveis de Ambiente e Configuração**

#### Problemas identificados:
- [ ] **URLs hardcoded** em vários arquivos JS
  - `js/dashboard.js` - linha 2
  - `js/medico.js` - múltiplas linhas
  - `js/atendente.js` - linha 12
  - `js/historico.js` - linha 12
  - `js/painel.js` - linha 12
  - `js/index.js` - linha 11

#### Solução recomendada:
- [ ] Criar arquivo `.env.example` com todas as variáveis
- [ ] Usar variáveis de ambiente no build (se usar build tool)
- [ ] Ou criar `config.production.js` separado

---

### 3. **Segurança**

#### Autenticação:
- [ ] **Implementar autenticação real via API** (atualmente é mock)
- [ ] Remover credenciais hardcoded de `js/login.js`
- [ ] Implementar JWT tokens ou sessões
- [ ] Adicionar logout automático por inatividade

#### Validações:
- [ ] Validar CPF no frontend antes de enviar
- [ ] Sanitizar inputs para prevenir XSS
- [ ] Validar todos os formulários

#### HTTPS:
- [ ] Garantir que o site use HTTPS em produção
- [ ] Configurar certificado SSL

---

### 4. **Performance e Otimização**

#### Imagens:
- [ ] Otimizar imagens grandes (`BG Vertical.jpg`, etc.)
- [ ] Converter para formatos modernos (WebP)
- [ ] Adicionar lazy loading

#### JavaScript:
- [ ] Minificar JavaScript para produção
- [ ] Remover `console.log` de produção (81 ocorrências encontradas)
- [ ] Considerar code splitting se o app crescer

#### CSS:
- [ ] Tailwind já está via CDN (ok para começar)
- [ ] Considerar build do Tailwind para reduzir tamanho

#### Caching:
- [ ] Configurar cache headers no servidor
- [ ] Implementar service worker para PWA (já tem manifest.json)

---

### 5. **Tratamento de Erros**

#### Melhorias necessárias:
- [ ] Tratamento global de erros (window.onerror)
- [ ] Mensagens de erro amigáveis para usuários
- [ ] Retry automático em caso de falha de rede
- [ ] Feedback visual durante carregamentos
- [ ] Tratamento de timeout de requisições

#### Logging:
- [ ] Integrar serviço de logging (Sentry, LogRocket, etc.)
- [ ] Remover console.log de produção
- [ ] Manter apenas logs críticos

---

### 6. **Testes**

#### Testes necessários:
- [ ] Testes manuais em diferentes navegadores
- [ ] Testes de responsividade (mobile, tablet, desktop)
- [ ] Testes de integração com backend
- [ ] Testes de fluxo completo (totem → atendente → médico → finalizado)

#### Navegadores para testar:
- [ ] Chrome/Edge (últimas 2 versões)
- [ ] Firefox (últimas 2 versões)
- [ ] Safari (últimas 2 versões)
- [ ] Mobile (iOS Safari, Chrome Android)

---

### 7. **Documentação**

#### Documentação necessária:
- [ ] Guia de deploy passo a passo
- [ ] Documentação de variáveis de ambiente
- [ ] Manual do usuário (para médicos e atendentes)
- [ ] Troubleshooting guide
- [ ] Arquitetura do sistema

---

### 8. **Monitoramento e Analytics**

#### Ferramentas recomendadas:
- [ ] Google Analytics ou similar
- [ ] Monitoramento de erros (Sentry)
- [ ] Monitoramento de performance
- [ ] Uptime monitoring

---

### 9. **Backup e Recuperação**

- [ ] Estratégia de backup do backend
- [ ] Documentar processo de restore
- [ ] Backup de configurações importantes

---

### 10. **Configurações de Produção**

#### Arquivos a criar/atualizar:

**`.env.production`** (exemplo):
```env
API_BASE_URL=https://safeatendimento-production.up.railway.app/api
NODE_ENV=production
ENABLE_LOGGING=false
```

**`netlify.toml`** (se usar Netlify):
```toml
[build]
  publish = "."
  command = "echo 'No build needed'"

[[redirects]]
  from = "/*"
  to = "/pages/index.html"
  status = 200
```

**`vercel.json`** (se usar Vercel):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/pages/$1" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

---

### 11. **Melhorias de UX/UI**

#### Pequenos ajustes:
- [ ] Loading states em todas as ações
- [ ] Mensagens de sucesso/erro consistentes
- [ ] Confirmações antes de ações críticas
- [ ] Tooltips e ajuda contextual

---

### 12. **Acessibilidade**

- [ ] Adicionar `alt` em todas as imagens
- [ ] Verificar contraste de cores
- [ ] Suporte a navegação por teclado
- [ ] ARIA labels onde necessário

---

## 🚀 Passos Imediatos para Deploy

### Opção 1: Netlify (Mais Fácil)

1. **Criar conta no Netlify**
2. **Conectar repositório GitHub**
3. **Configurar build:**
   - Build command: (deixar vazio ou `echo "No build needed"`)
   - Publish directory: `.` (raiz)
4. **Adicionar variáveis de ambiente** (se necessário)
5. **Deploy!**

### Opção 2: Vercel

1. **Criar conta no Vercel**
2. **Importar projeto do GitHub**
3. **Configurar:**
   - Framework Preset: Other
   - Root Directory: `.`
4. **Deploy!**

### Opção 3: GitHub Pages

1. **No repositório GitHub:**
   - Settings → Pages
   - Source: `main` branch
   - Folder: `/ (root)`
2. **Ajustar URLs no código** para usar GitHub Pages URL
3. **Deploy automático a cada push**

---

## ⚠️ Ações Imediatas Antes do Deploy

1. **Remover console.log de produção** (ou criar função que desabilita em produção)
2. **Testar todas as funcionalidades** em ambiente similar à produção
3. **Verificar se backend está acessível** da URL de produção
4. **Testar CORS** - garantir que backend aceita requisições do domínio de produção
5. **Configurar domínio customizado** (se necessário)
6. **Backup do código atual** (já está no GitHub ✅)

---

## 📝 Notas Importantes

- O sistema já detecta automaticamente se está em localhost ou produção
- Backend Railway já está configurado: `https://safeatendimento-production.up.railway.app`
- CORS precisa estar configurado no backend para aceitar o domínio de produção
- Considerar usar CDN para assets estáticos

---

## 🎯 Prioridade de Implementação

### Alta Prioridade (Antes do Deploy):
1. ✅ Remover/desabilitar console.log em produção
2. ✅ Testar fluxo completo
3. ✅ Verificar CORS no backend
4. ✅ Configurar hosting (Netlify/Vercel)

### Média Prioridade (Primeira semana):
1. Implementar autenticação real
2. Adicionar tratamento de erros global
3. Otimizar imagens
4. Adicionar monitoramento básico

### Baixa Prioridade (Melhorias contínuas):
1. Testes automatizados
2. PWA completo
3. Analytics avançado
4. Otimizações de performance



