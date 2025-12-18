# ✅ Checklist de Revisão de Pull Request

Use este checklist para revisar Pull Requests antes de fazer merge.

## 📋 Informações do PR

- **Branch:** `feature/nome` → `develop`
- **Autor:** @usuario
- **Data:** DD/MM/YYYY
- **Descrição:** [Resumo do que foi feito]

---

## 🔍 Revisão de Código

### 1. Estrutura e Organização
- [ ] Código bem organizado e legível
- [ ] Nomes de variáveis/funções descritivos
- [ ] Sem código duplicado
- [ ] Arquivos no lugar correto
- [ ] Sem arquivos desnecessários commitados

### 2. Funcionalidade
- [ ] Funciona como descrito no PR
- [ ] Não quebra funcionalidades existentes
- [ ] Tratamento de casos extremos (erros, valores vazios, etc)
- [ ] Validação de inputs adequada
- [ ] Mensagens de erro claras

### 3. Qualidade de Código
- [ ] Sem `console.log` desnecessários
- [ ] Sem código comentado (a menos que seja necessário)
- [ ] Código segue padrões do projeto
- [ ] Sem warnings ou erros de lint
- [ ] Performance considerada (não há loops desnecessários, etc)

### 4. Integração com API
- [ ] Chamadas à API corretas
- [ ] Tratamento de erros de rede
- [ ] Loading states implementados
- [ ] Fallbacks apropriados
- [ ] Sem mocks ou dados hardcoded

### 5. Segurança
- [ ] Sem dados sensíveis expostos
- [ ] Validação de inputs do usuário
- [ ] Sanitização de dados quando necessário
- [ ] Sem vulnerabilidades conhecidas

### 6. UI/UX
- [ ] Interface consistente com o resto do app
- [ ] Responsivo (mobile/desktop)
- [ ] Feedback visual adequado (loading, sucesso, erro)
- [ ] Acessibilidade básica (labels, alt text, etc)

---

## 📝 Documentação

- [ ] Código auto-explicativo ou com comentários quando necessário
- [ ] README atualizado (se aplicável)
- [ ] Mudanças significativas documentadas

---

## 🧪 Testes

- [ ] Funcionalidade testada manualmente
- [ ] Não quebra outras funcionalidades
- [ ] Testado em diferentes navegadores (se aplicável)
- [ ] Testado em mobile (se aplicável)

---

## 🔄 Git

- [ ] Commits descritivos e bem formatados
- [ ] Não há commits desnecessários (vários "fix", "wip", etc)
- [ ] Branch atualizada com develop (sem conflitos)
- [ ] Arquivos `.gitignore` respeitados

---

## 💬 Comentários do Revisor

### Pontos Positivos
- [Listar o que está bom]

### Sugestões de Melhoria
- [Listar melhorias sugeridas]

### Problemas Críticos
- [Listar problemas que devem ser corrigidos antes do merge]

---

## ✅ Decisão Final

- [ ] ✅ **Aprovado** - Pode fazer merge
- [ ] ⚠️ **Aprovado com sugestões** - Pode fazer merge, mas considere melhorias
- [ ] ❌ **Requer alterações** - Não fazer merge até corrigir problemas

---

## 📌 Notas Adicionais

[Espaço para observações adicionais]

---

**Revisado por:** @revisor  
**Data da revisão:** DD/MM/YYYY

