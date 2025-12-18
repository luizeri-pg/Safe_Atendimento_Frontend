# 🚀 Guia de Deploy - Safe Atendimento Frontend

## 📋 Pré-requisitos

- Conta no GitHub (já tem ✅)
- Código commitado e pushado (já feito ✅)
- Backend rodando no Railway (já configurado ✅)

---

## 🌐 Opção 1: Deploy no Netlify (Recomendado - Mais Fácil)

### Passo a Passo:

1. **Acesse:** https://www.netlify.com
2. **Crie uma conta** (pode usar GitHub para login)
3. **Clique em "Add new site" → "Import an existing project"**
4. **Conecte seu repositório GitHub:**
   - Selecione `Safe_Atendimento_Frontend`
   - Autorize o Netlify a acessar o repositório
5. **Configure o build:**
   - Build command: (deixe vazio ou `echo "No build needed"`)
   - Publish directory: `.` (ponto - raiz do projeto)
6. **Clique em "Deploy site"**
7. **Aguarde o deploy** (1-2 minutos)
8. **Acesse sua URL:** `https://seu-projeto.netlify.app`

### Configurar Domínio Customizado (Opcional):

1. No Netlify: Site settings → Domain management
2. Clique em "Add custom domain"
3. Digite seu domínio (ex: `safeatendimento.com.br`)
4. Siga as instruções para configurar DNS

---

## ⚡ Opção 2: Deploy no Vercel (Recomendado - Muito Rápido)

### Passo a Passo:

1. **Acesse:** https://vercel.com
2. **Crie uma conta** (pode usar GitHub)
3. **Clique em "Add New Project"**
4. **Importe seu repositório:**
   - Selecione `Safe_Atendimento_Frontend`
5. **Configure:**
   - Framework Preset: **Other**
   - Root Directory: `.` (raiz)
   - Build Command: (deixe vazio)
   - Output Directory: `.`
6. **Clique em "Deploy"**
7. **Aguarde** (30 segundos - 1 minuto)
8. **Acesse sua URL:** `https://seu-projeto.vercel.app`

---

## 📄 Opção 3: GitHub Pages (Gratuito, mas Limitado)

### Passo a Passo:

1. **No repositório GitHub:**
   - Vá em **Settings** → **Pages**
2. **Configure:**
   - Source: **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
3. **Salve**
4. **Aguarde alguns minutos**
5. **Acesse:** `https://luizeri-pg.github.io/Safe_Atendimento_Frontend/pages/index.html`

⚠️ **Nota:** GitHub Pages pode ter limitações com SPAs. Pode precisar ajustar URLs.

---

## 🔧 Configurações Pós-Deploy

### 1. Verificar CORS no Backend

Certifique-se de que o backend Railway aceita requisições do seu domínio de produção:

```javascript
// No backend, adicionar seu domínio Netlify/Vercel
const allowedOrigins = [
  'http://localhost:8000',
  'https://seu-projeto.netlify.app',
  'https://seu-projeto.vercel.app'
];
```

### 2. Testar Funcionalidades

Após o deploy, teste:
- [ ] Login funciona
- [ ] Totem gera senhas
- [ ] Atendente consegue cadastrar pacientes
- [ ] Médico consegue chamar pacientes
- [ ] Finalização de consulta funciona
- [ ] Histórico carrega corretamente

### 3. Verificar Console do Navegador

Abra o DevTools (F12) e verifique:
- [ ] Não há erros de CORS
- [ ] API está sendo chamada corretamente
- [ ] Mensagem: `🚀 API Config carregada` mostra URL de produção

---

## 🐛 Troubleshooting

### Problema: CORS Error

**Solução:** Configurar backend para aceitar requisições do domínio de produção.

### Problema: Páginas não carregam (404)

**Solução:** Verificar configuração de redirects no `netlify.toml` ou `vercel.json`.

### Problema: API não conecta

**Solução:** 
1. Verificar se backend Railway está online
2. Verificar URL no console do navegador
3. Verificar se não está detectando como localhost

### Problema: Imagens não aparecem

**Solução:** Verificar caminhos relativos. Em produção, podem precisar ser absolutos ou ajustados.

---

## 📊 Monitoramento Pós-Deploy

### Ferramentas Recomendadas:

1. **Uptime Robot** (gratuito)
   - Monitora se o site está online
   - Alerta se cair

2. **Google Analytics** (gratuito)
   - Monitora uso e comportamento

3. **Sentry** (freemium)
   - Monitora erros em produção

---

## ✅ Checklist Final

Antes de considerar "em produção":

- [ ] Deploy realizado com sucesso
- [ ] Site acessível via URL pública
- [ ] Backend conectando corretamente
- [ ] Todas as funcionalidades testadas
- [ ] CORS configurado
- [ ] Domínio customizado configurado (se aplicável)
- [ ] HTTPS funcionando
- [ ] Monitoramento configurado
- [ ] Equipe treinada para usar o sistema

---

## 🎯 Próximos Passos Após Deploy

1. **Monitorar por 24-48h** para garantir estabilidade
2. **Coletar feedback** dos usuários
3. **Implementar melhorias** baseadas no uso real
4. **Adicionar autenticação real** (substituir mock)
5. **Otimizar performance** conforme necessário

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique os logs do Netlify/Vercel
2. Verifique console do navegador (F12)
3. Verifique logs do backend Railway
4. Consulte o arquivo `DEPLOY_CHECKLIST.md` para itens pendentes



