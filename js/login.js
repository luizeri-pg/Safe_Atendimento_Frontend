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

      // Simulate API call
      setTimeout(() => {
        if (validateCredentials(email, password, selectedRole)) {
          // Salvar informações do usuário logado no localStorage
          localStorage.setItem('loggedUser', JSON.stringify({ email, role: selectedRole }));
          showSuccess('Login realizado com sucesso!');
          setTimeout(() => {
            redirectToDashboard(selectedRole);
          }, 1000);
        } else {
          showError('Credenciais inválidas');
        }
        showLoading(false);
      }, 1500);
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

function validateCredentials(email, password, role) {
  const validCredentials = {
    'medico@safe.com': { password: 'senha123', role: 'medico' },
    'medico2@safe.com': { password: 'senha123', role: 'medico' },
    'atendente@safe.com': { password: 'senha123', role: 'atendente' }
  };

  return validCredentials[email] && 
         validCredentials[email].password === password && 
         validCredentials[email].role === role;
}

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

