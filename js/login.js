let selectedRole = null;

// Role selection
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.role-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.role-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedRole = option.dataset.role;
    });
  });

  // Auto-fill demo credentials
  // NOTA: Estes são apenas valores de exemplo para facilitar desenvolvimento/testes.
  // A autenticação real é feita via API (ver função de submit do formulário).
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('focus', () => {
      if (selectedRole === 'medico') {
        document.getElementById('email').value = 'medico@safe.com';
        document.getElementById('password').value = 'senha123';
      } else if (selectedRole === 'atendente') {
        document.getElementById('email').value = 'atendente@safe.com';
        document.getElementById('password').value = 'senha123';
      }
    });
  }

  // Form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      
      if (!selectedRole) {
        showError('Selecione um tipo de usuário');
        return;
      }

      if (!email || !password) {
        showError('Preencha todos os campos');
        return;
      }

      // Show loading
      showLoading(true);
      hideMessages();

      // Chamada real à API
      try {
        const API_BASE_URL = window.API_CONFIG?.BASE_URL || 
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:3000/api'
            : 'https://safeatendimento-production.up.railway.app/api');
        
        // Tentar endpoint de login primeiro
        let loginUrl = `${API_BASE_URL}/usuarios/login`;
        let response = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role: selectedRole })
        });

        // Se não existir endpoint de login, buscar usuário na lista
        if (!response.ok && response.status === 404) {
          const usuariosUrl = `${API_BASE_URL}/usuarios`;
          const usuariosResponse = await fetch(usuariosUrl);
          
          if (usuariosResponse.ok) {
            const usuarios = await usuariosResponse.json();
            const usuario = usuarios.find(u => 
              u.email === email && 
              u.senha === password && 
              (u.role === selectedRole || u.tipo === selectedRole || u.funcao === selectedRole)
            );
            
            if (usuario) {
              // Salvar informações do usuário logado no localStorage
              localStorage.setItem('loggedUser', JSON.stringify({ 
                email, 
                role: selectedRole,
                nome: usuario.nome || usuario.name,
                id: usuario.id
              }));
              showSuccess('Login realizado com sucesso!');
              setTimeout(() => {
                redirectToDashboard(selectedRole);
              }, 1000);
              showLoading(false);
              return;
            }
          }
        }

        // Se endpoint de login existir e retornar sucesso
        if (response.ok) {
          const userData = await response.json();
          localStorage.setItem('loggedUser', JSON.stringify({ 
            email, 
            role: selectedRole,
            nome: userData.nome || userData.name,
            id: userData.id
          }));
          showSuccess('Login realizado com sucesso!');
          setTimeout(() => {
            redirectToDashboard(selectedRole);
          }, 1000);
        } else {
          const errorData = await response.json().catch(() => ({}));
          showError(errorData.message || 'Credenciais inválidas');
        }
      } catch (error) {
        console.error('Erro ao fazer login:', error);
        showError('Erro ao conectar com o servidor. Verifique sua conexão.');
      } finally {
        showLoading(false);
      }
    });
  }

  // Auto-select role on demo credential click
  document.querySelectorAll('.demo-credentials p').forEach(p => {
    p.addEventListener('click', () => {
      if (p.textContent.includes('Médico')) {
        document.querySelector('[data-role="medico"]').click();
      } else if (p.textContent.includes('Atendente')) {
        document.querySelector('[data-role="atendente"]').click();
      }
    });
  });
});

// Função removida - agora usa API real

function redirectToDashboard(role) {
  // Sempre redirecionar para o dashboard principal primeiro
  window.location.href = 'dashboard.html';
}

function showLoading(show) {
  const button = document.getElementById('loginButton');
  const buttonText = document.getElementById('buttonText');
  const buttonLoading = document.getElementById('buttonLoading');
  
  if (show) {
    button.disabled = true;
    buttonText.style.display = 'none';
    buttonLoading.style.display = 'block';
  } else {
    button.disabled = false;
    buttonText.style.display = 'block';
    buttonLoading.style.display = 'none';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function showSuccess(message) {
  const successDiv = document.getElementById('successMessage');
  successDiv.textContent = message;
  successDiv.style.display = 'block';
}

function hideMessages() {
  const errorDiv = document.getElementById('errorMessage');
  const successDiv = document.getElementById('successMessage');
  if (errorDiv) errorDiv.style.display = 'none';
  if (successDiv) successDiv.style.display = 'none';
}

function showForgotPassword() {
  alert('Funcionalidade em desenvolvimento. Entre em contato com o administrador do sistema.');
}

window.showForgotPassword = showForgotPassword;

