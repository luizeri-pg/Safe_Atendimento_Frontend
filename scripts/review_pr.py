#!/usr/bin/env python3
"""
Script de Revisão Automática de Pull Request
Analisa mudanças e gera relatório de revisão
"""

import os
import sys
import subprocess
import re
from pathlib import Path

# Cores para output
class Colors:
    GREEN = '\033[0;32m'
    BLUE = '\033[0;34m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'  # No Color

def print_header(text):
    print(f"\n{Colors.BLUE}{'='*60}{Colors.NC}")
    print(f"{Colors.BLUE}{text}{Colors.NC}")
    print(f"{Colors.BLUE}{'='*60}{Colors.NC}\n")

def print_success(text):
    print(f"{Colors.GREEN}✅ {text}{Colors.NC}")

def print_warning(text):
    print(f"{Colors.YELLOW}⚠️  {text}{Colors.NC}")

def print_error(text):
    print(f"{Colors.RED}❌ {text}{Colors.NC}")

def check_console_logs(files):
    """Verifica se há console.log desnecessários"""
    issues = []
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
                for i, line in enumerate(lines, 1):
                    # Ignorar comentários e console.log em try/catch para debug
                    if 'console.log' in line and not line.strip().startswith('//'):
                        # Verificar se não é um console.error ou console.warn (esses são OK)
                        if 'console.log' in line and 'console.error' not in line and 'console.warn' not in line:
                            issues.append({
                                'file': file_path,
                                'line': i,
                                'content': line.strip()
                            })
        except Exception as e:
            print_warning(f"Erro ao ler {file_path}: {e}")
    
    return issues

def check_hardcoded_data(files):
    """Verifica se há dados hardcoded ou mocks"""
    issues = []
    mock_patterns = [
        r'validateCredentials',
        r'senha123',
        r'mock',
        r'Mock',
        r'setTimeout.*API',
        r'Simulate.*API'
    ]
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                for pattern in mock_patterns:
                    matches = re.finditer(pattern, content, re.IGNORECASE)
                    for match in matches:
                        line_num = content[:match.start()].count('\n') + 1
                        issues.append({
                            'file': file_path,
                            'line': line_num,
                            'pattern': pattern,
                            'content': content.split('\n')[line_num - 1].strip() if line_num <= len(content.split('\n')) else ''
                        })
        except Exception as e:
            print_warning(f"Erro ao ler {file_path}: {e}")
    
    return issues

def check_api_calls(files):
    """Verifica se há chamadas à API adequadas"""
    issues = []
    api_patterns = [
        r'fetch\s*\(',
        r'API_CONFIG',
        r'API_BASE_URL'
    ]
    
    has_api_calls = False
    
    for file_path in files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                for pattern in api_patterns:
                    if re.search(pattern, content):
                        has_api_calls = True
                        break
        except Exception as e:
            print_warning(f"Erro ao ler {file_path}: {e}")
    
    if not has_api_calls and any(f.endswith('.js') for f in files):
        issues.append({
            'file': 'Geral',
            'message': 'Nenhuma chamada à API encontrada. Verifique se está usando API real.'
        })
    
    return issues

def check_error_handling(files):
    """Verifica tratamento de erros"""
    issues = []
    
    for file_path in files:
        if not file_path.endswith('.js'):
            continue
            
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                lines = content.split('\n')
                
                # Verificar se há fetch sem try/catch
                for i, line in enumerate(lines):
                    if 'fetch(' in line:
                        # Verificar se há try/catch nas próximas linhas
                        context = '\n'.join(lines[max(0, i-10):min(len(lines), i+20)])
                        if 'try' not in context or 'catch' not in context:
                            issues.append({
                                'file': file_path,
                                'line': i + 1,
                                'message': 'Chamada fetch sem tratamento de erro (try/catch)'
                            })
        except Exception as e:
            print_warning(f"Erro ao ler {file_path}: {e}")
    
    return issues

def get_changed_files():
    """Obtém lista de arquivos modificados"""
    try:
        # Verificar se há diferença com develop
        result = subprocess.run(
            ['git', 'diff', '--name-only', 'develop'],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0 and result.stdout.strip():
            return [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
        
        # Se não há diferença com develop, verificar staged files
        result = subprocess.run(
            ['git', 'diff', '--name-only', '--cached'],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0 and result.stdout.strip():
            return [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
        
        # Se ainda não há, verificar arquivos modificados
        result = subprocess.run(
            ['git', 'status', '--short'],
            capture_output=True,
            text=True,
            check=False
        )
        
        if result.returncode == 0:
            files = []
            for line in result.stdout.strip().split('\n'):
                if line.strip():
                    file_path = line.split()[-1]
                    if os.path.exists(file_path):
                        files.append(file_path)
            return files
        
        return []
    except Exception as e:
        print_warning(f"Erro ao obter arquivos modificados: {e}")
        return []

def main():
    print_header("🔍 Revisão Automática de Pull Request")
    
    # Obter arquivos modificados
    changed_files = get_changed_files()
    
    if not changed_files:
        print_warning("Nenhum arquivo modificado encontrado.")
        print("💡 Dica: Certifique-se de estar em uma branch com mudanças ou use:")
        print("   git diff --name-only develop")
        return
    
    print(f"📁 Arquivos modificados: {len(changed_files)}")
    for f in changed_files[:10]:  # Mostrar apenas os primeiros 10
        print(f"   - {f}")
    if len(changed_files) > 10:
        print(f"   ... e mais {len(changed_files) - 10} arquivos")
    
    # Filtrar apenas arquivos JavaScript
    js_files = [f for f in changed_files if f.endswith('.js')]
    
    if not js_files:
        print_warning("Nenhum arquivo JavaScript encontrado para revisar.")
        return
    
    print(f"\n📝 Revisando {len(js_files)} arquivo(s) JavaScript...\n")
    
    # Realizar verificações
    all_issues = []
    
    # 1. Console.logs
    print("1️⃣ Verificando console.log...")
    console_issues = check_console_logs(js_files)
    if console_issues:
        print_error(f"Encontrados {len(console_issues)} console.log(s):")
        for issue in console_issues[:5]:  # Mostrar apenas os primeiros 5
            print(f"   {issue['file']}:{issue['line']} - {issue['content'][:60]}")
        all_issues.extend(console_issues)
    else:
        print_success("Nenhum console.log encontrado")
    
    # 2. Dados hardcoded
    print("\n2️⃣ Verificando dados hardcoded/mocks...")
    hardcoded_issues = check_hardcoded_data(js_files)
    if hardcoded_issues:
        print_error(f"Encontrados {len(hardcoded_issues)} possível(is) mock(s):")
        for issue in hardcoded_issues[:5]:
            print(f"   {issue['file']}:{issue['line']} - Padrão: {issue['pattern']}")
        all_issues.extend(hardcoded_issues)
    else:
        print_success("Nenhum mock encontrado")
    
    # 3. Chamadas à API
    print("\n3️⃣ Verificando chamadas à API...")
    api_issues = check_api_calls(js_files)
    if api_issues:
        for issue in api_issues:
            print_warning(issue.get('message', 'Problema com API'))
        all_issues.extend(api_issues)
    else:
        print_success("Chamadas à API encontradas")
    
    # 4. Tratamento de erros
    print("\n4️⃣ Verificando tratamento de erros...")
    error_issues = check_error_handling(js_files)
    if error_issues:
        print_error(f"Encontrados {len(error_issues)} problema(s) com tratamento de erro:")
        for issue in error_issues[:5]:
            print(f"   {issue['file']}:{issue['line']} - {issue['message']}")
        all_issues.extend(error_issues)
    else:
        print_success("Tratamento de erros adequado")
    
    # Resumo final
    print_header("📊 Resumo da Revisão")
    
    if all_issues:
        print_error(f"Total de problemas encontrados: {len(all_issues)}")
        print("\n💡 Recomendações:")
        if console_issues:
            print("   - Remover console.log desnecessários")
        if hardcoded_issues:
            print("   - Verificar se não há mocks ou dados hardcoded")
        if error_issues:
            print("   - Adicionar tratamento de erros adequado")
        
        print(f"\n⚠️  Requer atenção antes do merge")
        return 1
    else:
        print_success("Nenhum problema encontrado!")
        print("✅ Código parece estar pronto para revisão")
        return 0

if __name__ == '__main__':
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  Revisão interrompida pelo usuário")
        sys.exit(1)
    except Exception as e:
        print_error(f"Erro inesperado: {e}")
        sys.exit(1)

