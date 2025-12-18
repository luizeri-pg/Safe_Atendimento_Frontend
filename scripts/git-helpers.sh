#!/bin/bash

# Git Workflow Helpers - Safe Atendimento Frontend
# Uso: source scripts/git-helpers.sh (ou . scripts/git-helpers.sh)

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Função para criar nova feature branch
git-feature() {
    if [ -z "$1" ]; then
        echo -e "${RED}Erro: Informe o nome da feature${NC}"
        echo "Uso: git-feature nome-da-feature"
        return 1
    fi
    
    echo -e "${BLUE}🔄 Atualizando develop...${NC}"
    git checkout develop
    git pull origin develop
    
    echo -e "${BLUE}🌿 Criando branch feature/$1...${NC}"
    git checkout -b feature/$1
    
    echo -e "${GREEN}✅ Branch feature/$1 criada!${NC}"
    echo -e "${YELLOW}💡 Desenvolva sua feature e use: git commit -m 'feat: descrição'${NC}"
}

# Função para criar nova fix branch
git-fix() {
    if [ -z "$1" ]; then
        echo -e "${RED}Erro: Informe o nome do fix${NC}"
        echo "Uso: git-fix nome-do-fix"
        return 1
    fi
    
    echo -e "${BLUE}🔄 Atualizando develop...${NC}"
    git checkout develop
    git pull origin develop
    
    echo -e "${BLUE}🔧 Criando branch fix/$1...${NC}"
    git checkout -b fix/$1
    
    echo -e "${GREEN}✅ Branch fix/$1 criada!${NC}"
    echo -e "${YELLOW}💡 Desenvolva sua correção e use: git commit -m 'fix: descrição'${NC}"
}

# Função para fazer merge de feature para develop
git-merge-feature() {
    if [ -z "$1" ]; then
        echo -e "${RED}Erro: Informe o nome da feature${NC}"
        echo "Uso: git-merge-feature nome-da-feature"
        return 1
    fi
    
    CURRENT_BRANCH=$(git branch --show-current)
    
    if [ "$CURRENT_BRANCH" != "feature/$1" ]; then
        echo -e "${YELLOW}⚠️  Mudando para branch feature/$1...${NC}"
        git checkout feature/$1
    fi
    
    echo -e "${BLUE}🔄 Atualizando develop...${NC}"
    git checkout develop
    git pull origin develop
    
    echo -e "${BLUE}🔀 Fazendo merge de feature/$1 para develop...${NC}"
    git merge feature/$1 --no-ff -m "Merge feature/$1 into develop"
    
    echo -e "${BLUE}📤 Enviando para remoto...${NC}"
    git push origin develop
    
    echo -e "${YELLOW}🗑️  Deletar branch local? (y/n)${NC}"
    read -r response
    if [ "$response" = "y" ]; then
        git branch -d feature/$1
        echo -e "${GREEN}✅ Branch feature/$1 deletada localmente${NC}"
    fi
    
    echo -e "${GREEN}✅ Merge concluído!${NC}"
}

# Função para atualizar branch atual com develop
git-update() {
    CURRENT_BRANCH=$(git branch --show-current)
    
    if [ "$CURRENT_BRANCH" = "develop" ] || [ "$CURRENT_BRANCH" = "main" ]; then
        echo -e "${BLUE}🔄 Atualizando $CURRENT_BRANCH...${NC}"
        git pull origin "$CURRENT_BRANCH"
    else
        echo -e "${BLUE}🔄 Atualizando develop...${NC}"
        git checkout develop
        git pull origin develop
        
        echo -e "${BLUE}🔄 Voltando para $CURRENT_BRANCH...${NC}"
        git checkout "$CURRENT_BRANCH"
        
        echo -e "${BLUE}🔀 Fazendo merge de develop...${NC}"
        git merge develop
    fi
    
    echo -e "${GREEN}✅ Atualização concluída!${NC}"
}

# Função para criar release
git-release() {
    if [ -z "$1" ]; then
        echo -e "${RED}Erro: Informe a versão${NC}"
        echo "Uso: git-release 1.0.0"
        return 1
    fi
    
    echo -e "${BLUE}🔄 Atualizando develop...${NC}"
    git checkout develop
    git pull origin develop
    
    echo -e "${BLUE}🏷️  Criando release branch release/v$1...${NC}"
    git checkout -b release/v$1
    
    echo -e "${GREEN}✅ Release branch criada!${NC}"
    echo -e "${YELLOW}💡 Faça ajustes finais, testes, etc.${NC}"
    echo -e "${YELLOW}💡 Depois use: git-release-merge $1${NC}"
}

# Função para fazer merge de release para main
git-release-merge() {
    if [ -z "$1" ]; then
        echo -e "${RED}Erro: Informe a versão${NC}"
        echo "Uso: git-release-merge 1.0.0"
        return 1
    fi
    
    CURRENT_BRANCH=$(git branch --show-current)
    
    if [ "$CURRENT_BRANCH" != "release/v$1" ]; then
        echo -e "${YELLOW}⚠️  Mudando para branch release/v$1...${NC}"
        git checkout release/v$1
    fi
    
    echo -e "${BLUE}🔄 Atualizando main...${NC}"
    git checkout main
    git pull origin main
    
    echo -e "${BLUE}🔀 Fazendo merge de release/v$1 para main...${NC}"
    git merge release/v$1 --no-ff -m "Release v$1"
    
    echo -e "${BLUE}🏷️  Criando tag v$1...${NC}"
    git tag -a v$1 -m "Release v$1"
    
    echo -e "${BLUE}📤 Enviando para remoto...${NC}"
    git push origin main --tags
    
    echo -e "${BLUE}🔄 Voltando para develop...${NC}"
    git checkout develop
    git merge release/v$1
    git push origin develop
    
    echo -e "${YELLOW}🗑️  Deletar release branch? (y/n)${NC}"
    read -r response
    if [ "$response" = "y" ]; then
        git branch -d release/v$1
        git push origin --delete release/v$1
        echo -e "${GREEN}✅ Release branch deletada${NC}"
    fi
    
    echo -e "${GREEN}✅ Release v$1 concluída!${NC}"
}

# Função para mostrar status resumido
git-status-summary() {
    echo -e "${BLUE}📊 Status do Repositório${NC}"
    echo ""
    echo -e "${YELLOW}Branch atual:${NC} $(git branch --show-current)"
    echo -e "${YELLOW}Último commit:${NC} $(git log -1 --oneline)"
    echo ""
    echo -e "${YELLOW}Arquivos modificados:${NC}"
    git status --short
}

# Mostrar ajuda
git-help() {
    echo -e "${BLUE}🛠️  Git Workflow Helpers${NC}"
    echo ""
    echo "Comandos disponíveis:"
    echo ""
    echo -e "${GREEN}git-feature nome${NC}          - Criar nova feature branch"
    echo -e "${GREEN}git-fix nome${NC}              - Criar nova fix branch"
    echo -e "${GREEN}git-merge-feature nome${NC}    - Merge feature para develop"
    echo -e "${GREEN}git-update${NC}                - Atualizar branch atual com develop"
    echo -e "${GREEN}git-release versao${NC}        - Criar release branch (ex: 1.0.0)"
    echo -e "${GREEN}git-release-merge versao${NC}  - Merge release para main"
    echo -e "${GREEN}git-status-summary${NC}        - Status resumido"
    echo ""
    echo "Exemplos:"
    echo "  git-feature autenticacao-api"
    echo "  git-fix erro-login"
    echo "  git-release 1.0.0"
}

# Mostrar ajuda ao carregar
echo -e "${GREEN}✅ Git helpers carregados!${NC}"
echo -e "${YELLOW}💡 Use 'git-help' para ver comandos disponíveis${NC}"

