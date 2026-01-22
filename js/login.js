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
        const apiBase = window.API_CONFIG?.BASE_URL || null;

        // A partir de agora NÃO usamos SQLite/back-end para login.
        // Se o Supabase não estiver configurado (anon key ausente), mostramos um erro claro.
        if (!supa) {
          showError(
            'Supabase não configurado no frontend. Defina SUPABASE_URL e SUPABASE_ANON_KEY (ou use querystring/localStorage) e recarregue a página.'
          );
          return;
        }

        const email = `${String(username).trim().toLowerCase()}@${authDomain}`;
        const { data, error } = await supa.auth.signInWithPassword({ email, password });
        if (error || !data?.user) {
          showError(error?.message || 'Credenciais inválidas');
          return;
        }

        // Em produção (Railway), o Safari pode bloquear chamadas cross-site ao PostgREST.
        // Então buscamos o profile via backend (/api/supa/*), evitando CORS no browser.
        const accessToken = data?.session?.access_token || null;
        if (!apiBase || !accessToken) {
          await supa.auth.signOut().catch(() => {});
          showError('Sessão inválida. Recarregue a página e tente novamente.');
          return;
        }

        const profRes = await fetch(
          `${apiBase}/supa/profiles?select=id,username,nome,role&id=eq.${encodeURIComponent(data.user.id)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/json',
            },
          }
        );

        if (!profRes.ok) {
          const txt = await profRes.text().catch(() => '');
          await supa.auth.signOut().catch(() => {});
          showError('Erro ao carregar perfil. Verifique sua conexão.');
          console.error('Falha ao buscar profile via backend:', profRes.status, txt.slice(0, 300));
          return;
        }

        const profArr = await profRes.json().catch(() => []);
        const profile = Array.isArray(profArr) ? profArr[0] : profArr;
        const profileErr = !profile ? new Error('profile_not_found') : null;

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

