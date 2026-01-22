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

          const role = String(profile.role || '').trim();
          if (!role) {
            await supa.auth.signOut().catch(() => {});
            showError('Perfil sem role definido (tabela profiles).');
            return;
          }

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
          body: JSON.stringify({ email, password })
        });

        if (response.ok) {
          const userData = await response.json();
          localStorage.setItem('loggedUser', JSON.stringify({
            email,
            role: userData.role,
            nome: userData.nome || userData.name,
            id: userData.id
          }));
          showSuccess('Login realizado com sucesso!');
          setTimeout(() => redirectToDashboard(userData.role), 1000);
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

