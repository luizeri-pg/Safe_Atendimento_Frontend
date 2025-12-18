# 🚀 Guia Rápido de Git Workflow

## ⚡ Início Rápido

### 1. Configurar Scripts (Primeira vez)

```bash
# Adicionar helpers ao seu .bashrc ou .zshrc
echo "source $(pwd)/scripts/git-helpers.sh" >> ~/.zshrc
source ~/.zshrc

# Ou usar diretamente
source scripts/git-helpers.sh
```

### 2. Criar Nova Feature

```bash
# Usando o helper (recomendado)
git-feature nome-da-feature

# Ou manualmente
git checkout develop
git pull origin develop
git checkout -b feature/nome-da-feature
```

### 3. Desenvolver e Commitar

```bash
# Fazer alterações...
git add .
git commit -m "feat: descrição da feature"
git push origin feature/nome-da-feature
```

### 4. Revisar Código

```bash
# Revisão automática
python3 scripts/review_pr.py

# Ou revisar manualmente usando o checklist
# Ver: PR_REVIEW_CHECKLIST.md
```

### 5. Criar Pull Request

1. Ir para GitHub
2. Criar PR: `feature/nome-da-feature` → `develop`
3. Usar template do PR (será preenchido automaticamente)
4. Aguardar revisão

### 6. Após Merge

```bash
git checkout develop
git pull origin develop
git branch -d feature/nome-da-feature  # deletar branch local
```

## 📋 Comandos Úteis

### Ver status resumido
```bash
git-status-summary
```

### Atualizar branch atual
```bash
git-update
```

### Criar release
```bash
git-release 1.0.0
# ... fazer ajustes ...
git-release-merge 1.0.0
```

### Ver ajuda
```bash
git-help
```

## 🔍 Revisão de PR

### Revisão Automática
```bash
python3 scripts/review_pr.py
```

O script verifica:
- ✅ Console.logs desnecessários
- ✅ Mocks ou dados hardcoded
- ✅ Chamadas à API
- ✅ Tratamento de erros

### Revisão Manual

Use o checklist em `PR_REVIEW_CHECKLIST.md`:
1. Abrir o arquivo
2. Preencher conforme revisa o código
3. Marcar itens verificados
4. Adicionar comentários

## 📚 Documentação Completa

- **GIT_WORKFLOW.md** - Guia completo de workflow
- **PR_REVIEW_CHECKLIST.md** - Checklist detalhado de revisão
- **scripts/git-helpers.sh** - Scripts automatizados

## 💡 Dicas

1. **Sempre atualize develop antes de criar nova feature**
   ```bash
   git-update
   ```

2. **Use commits descritivos**
   ```bash
   git commit -m "feat: adicionar autenticação via API"
   git commit -m "fix: corrigir erro ao carregar senhas"
   ```

3. **Revise antes de fazer PR**
   ```bash
   python3 scripts/review_pr.py
   ```

4. **Use Pull Requests para revisão**
   - Nunca merge direto em develop/main
   - Sempre use PR para revisão

5. **Mantenha branches limpas**
   - Delete branches após merge
   - Mantenha apenas branches ativas

## 🆘 Problemas Comuns

### Conflitos ao fazer merge
```bash
git checkout develop
git pull origin develop
git checkout feature/sua-feature
git merge develop
# Resolver conflitos manualmente
git add .
git commit -m "fix: resolver conflitos com develop"
```

### Branch desatualizada
```bash
git-update  # Atualiza automaticamente
```

### Esqueceu de commitar algo
```bash
git add arquivo-esquecido.js
git commit --amend --no-edit  # Adiciona ao último commit
git push --force-with-lease origin feature/sua-feature
```

## 📞 Precisa de Ajuda?

1. Ver `GIT_WORKFLOW.md` para detalhes
2. Usar `git-help` para ver comandos
3. Revisar `PR_REVIEW_CHECKLIST.md` para revisão

