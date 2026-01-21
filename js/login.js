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
  const usernameInput = document.getElementById('username');
  if (usernameInput) {
    usernameInput.addEventListener('focus', () => {
      if (selectedRole === 'medico') {
        document.getElementById('username').value = 'medico1';
        document.getElementById('password').value = 'senha123';
      } else if (selectedRole === 'atendente') {
        document.getElementById('username').value = 'atendente1';
        document.getElementById('password').value = 'senha123';
      }
    });
  }

  // Form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      
      if (!selectedRole) {
        showError('Selecione um tipo de usuário');
        return;
      }

      if (!username || !password) {
        showError('Preencha todos os campos');
        return;
      }

      // Show loading
      showLoading(true);
      hideMessages();

      // Autenticação: Supabase (preferencial) ou backend antigo (fallback).
      try {
        const supa = window.safeSupabase;
        const authDomain = window.SAFE_SUPABASE_CONFIG?.authDomain || 'safe.local';

        if (supa) {
          const email = `${String(username).trim().toLowerCase()}@${authDomain}`;
          const { data, error } = await supa.auth.signInWithPassword({ email, password });
          if (error || !data?.user) {
            showError(error?.message || 'Credenciais inválidas');
            return;
          }

          const { data: profile, error: profileErr } = await supa
            .from('profiles')
            .select('id, username, nome, role')
            .eq('id', data.user.id)
            .single();

          if (profileErr || !profile) {
            // Se não houver profile, desloga para evitar sessão "meio configurada"
            await supa.auth.signOut().catch(() => {});
            showError('Perfil não encontrado no Supabase (tabela profiles).');
            return;
          }

          if (String(profile.role || '') !== String(selectedRole || '')) {
            await supa.auth.signOut().catch(() => {});
            showError('Tipo de usuário não confere com o perfil cadastrado.');
            return;
          }

          localStorage.setItem(
            'loggedUser',
            JSON.stringify({
              id: profile.id,
              username: profile.username,
              nome: profile.nome,
              role: profile.role,
            })
          );

          showSuccess('Login realizado com sucesso!');
          setTimeout(() => redirectToDashboard(selectedRole), 500);
          return;
        }

        // Fallback: backend antigo (SQLite)
        const API_BASE_URL =
          window.API_CONFIG?.BASE_URL ||
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname === ''
            ? 'http://localhost:3000/api'
            : `${window.location.origin}/api`);

        const email = username; // compat: backend antigo ainda usa "email"
        const loginUrl = `${API_BASE_URL}/usuarios/login`;
        const response = await fetch(loginUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, role: selectedRole })
        });

        if (response.ok) {
          const userData = await response.json();
          localStorage.setItem('loggedUser', JSON.stringify({
            email,
            role: selectedRole,
            nome: userData.nome || userData.name,
            id: userData.id
          }));
          showSuccess('Login realizado com sucesso!');
          setTimeout(() => redirectToDashboard(selectedRole), 1000);
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        showError(errorData.message || 'Credenciais inválidas');
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
  // Novo fluxo: sempre cai no Dashboard, que adapta UI por perfil.
  // As páginas específicas continuam protegidas pelos seus próprios guards.
  if (role === 'atendente' || role === 'medico') {
    window.location.href = 'dashboard.html';
    return;
  }
  window.location.href = 'login.html';
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

