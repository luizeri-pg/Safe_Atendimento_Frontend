# 🔄 Git Workflow - Safe Atendimento Frontend

## 📋 Estrutura de Branches

```
main (produção)
  ↑
develop (desenvolvimento)
  ↑
feature/nome-da-feature (nova funcionalidade)
fix/nome-do-fix (correção de bug)
```

## 🚀 Fluxo de Trabalho

### 1. Criar Nova Feature

```bash
# Atualizar develop
git checkout develop
git pull origin develop

# Criar branch da feature
git checkout -b feature/nome-da-feature

# Desenvolver...
git add .
git commit -m "feat: descrição da feature"

# Push
git push origin feature/nome-da-feature
```

### 2. Merge Feature → Develop

**Opção A: Via Pull Request (Recomendado)**
1. Criar PR no GitHub: `feature/nome-da-feature` → `develop`
2. Aguardar revisão
3. Após merge, atualizar local:
```bash
git checkout develop
git pull origin develop
git branch -d feature/nome-da-feature  # deletar branch local
```

**Opção B: Merge Direto (Apenas se necessário)**
```bash
git checkout develop
git pull origin develop
git merge feature/nome-da-feature
git push origin develop
git branch -d feature/nome-da-feature
```

### 3. Merge Develop → Main (Release)

**Quando fazer:**
- ✅ Develop estável e testada
- ✅ Todas as features importantes completas
- ✅ Pronto para produção

**Processo:**
```bash
# 1. Criar release branch (opcional mas recomendado)
git checkout develop
git checkout -b release/v1.0.0

# 2. Fazer ajustes finais, testes, etc.
# 3. Merge para main
git checkout main
git pull origin main
git merge release/v1.0.0

# 4. Criar tag de versão
git tag -a v1.0.0 -m "Release v1.0.0: Descrição do release"
git push origin main --tags

# 5. Voltar develop para incluir a release
git checkout develop
git merge release/v1.0.0
git push origin develop
```

## 📝 Convenções de Commit

Use prefixos descritivos:

- `feat:` - Nova funcionalidade
- `fix:` - Correção de bug
- `refactor:` - Refatoração de código
- `docs:` - Documentação
- `style:` - Formatação, espaços, etc
- `test:` - Testes
- `chore:` - Tarefas de manutenção

**Exemplos:**
```bash
git commit -m "feat: adicionar autenticação via API"
git commit -m "fix: corrigir erro ao carregar senhas"
git commit -m "refactor: remover mocks e conectar à API real"
```

## ✅ Checklist Antes de Merge

### Feature → Develop
- [ ] Código funcional e testado
- [ ] Sem erros de lint (`npm run lint` se tiver)
- [ ] Sem console.log desnecessários
- [ ] Código revisado (se aplicável)
- [ ] Mensagens de commit descritivas
- [ ] Branch atualizada com develop

### Develop → Main
- [ ] Todas as features importantes completas
- [ ] Testes passando
- [ ] Sem bugs conhecidos críticos
- [ ] Documentação atualizada (se necessário)
- [ ] Versão atualizada (se aplicável)

## 🔍 Revisão de Pull Requests

### O que verificar:

1. **Código:**
   - [ ] Lógica correta
   - [ ] Sem código comentado desnecessário
   - [ ] Tratamento de erros adequado
   - [ ] Performance considerada

2. **Qualidade:**
   - [ ] Nomes de variáveis/funções descritivos
   - [ ] Código limpo e legível
   - [ ] Sem duplicação de código
   - [ ] Comentários quando necessário

3. **Funcionalidade:**
   - [ ] Funciona como esperado
   - [ ] Não quebra funcionalidades existentes
   - [ ] Tratamento de casos extremos

4. **Segurança:**
   - [ ] Sem dados sensíveis expostos
   - [ ] Validação de inputs
   - [ ] Sanitização de dados

## 🛠️ Scripts Úteis

Veja `scripts/git-helpers.sh` para scripts automatizados.

## 📚 Recursos

- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [Conventional Commits](https://www.conventionalcommits.org/)

