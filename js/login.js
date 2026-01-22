document.addEventListener('DOMContentLoaded', () => {
  // Form submission
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = String(document.getElementById('username')?.value || '').trim();
      const password = String(document.getElementById('password')?.value || '').trim();

      if (!username || !password) {
        showError('Preencha todos os campos');
        return;
      }

      // Show loading
      showLoading(true);
      hideMessages();

      // Autenticação (backend-first):
      // - o backend valida no Supabase Auth e retorna access_token + profile
      // - o navegador guarda apenas o token e o profile (para guards/UI)
      try {
        const apiBase = window.API_CONFIG?.BASE_URL || null;
        if (!apiBase) {
          showError('API não configurada. Recarregue a página e tente novamente.');
          return;
        }

        const resp = await fetch(`${apiBase}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ username, password })
        });

        if (!resp.ok) {
          const txt = await resp.text().catch(() => '');
          showError('Credenciais inválidas');
          console.error('Falha no login via backend:', resp.status, txt.slice(0, 300));
          return;
        }

        const data = await resp.json().catch(() => null);
        const accessToken = String(data?.access_token || '').trim();
        const refreshToken = String(data?.refresh_token || '').trim();
        const profile = data?.profile || null;
        const role = String(profile?.role || '').trim();

        if (!accessToken || !refreshToken || !profile || !role) {
          showError('Resposta de login inválida. Tente novamente.');
          return;
        }

        // Token para chamadas ao backend-proxy (evita depender da sessão do Safari no supabase-js)
        localStorage.setItem('SAFE_ACCESS_TOKEN', accessToken);
        localStorage.setItem('SAFE_REFRESH_TOKEN', refreshToken);
        localStorage.setItem(
          'loggedUser',
          JSON.stringify({
            id: profile.id,
            username: profile.username,
            nome: profile.nome,
            role: role,
          })
        );

        showSuccess('Login realizado com sucesso!');
        setTimeout(() => redirectToDashboard(role), 500);
        return;
      } catch (error) {
        console.error('Erro ao fazer login:', error);
        showError('Erro ao conectar com o servidor. Verifique sua conexão.');
      } finally {
        showLoading(false);
      }
    });
  }
});

// Função removida - agora usa API real

function redirectToDashboard(role) {
  // Novo fluxo: sempre cai no Dashboard, que adapta UI por perfil.
  // As páginas específicas continuam protegidas pelos seus próprios guards.
  if (role === 'atendente' || role === 'medico' || role === 'enfermagem' || role === 'fono') {
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

