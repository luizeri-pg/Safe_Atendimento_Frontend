// Configuração do Supabase para frontend estático (sem build).
// Como evitar hardcode de credenciais no repo:
// - Setar via localStorage (recomendado para localhost):
//   localStorage.setItem('SAFE_SUPABASE_URL', 'https://SEU_ID.supabase.co')
//   localStorage.setItem('SAFE_SUPABASE_ANON_KEY', 'SUA_ANON_KEY')
// - Ou via querystring:
//   ?supabaseUrl=https://SEU_ID.supabase.co&supabaseAnonKey=SUA_ANON_KEY
//
// Observação:
// - A anon key é "pública", mas o que protege seus dados é o RLS.
// - Service role key NUNCA deve ir para o navegador.
(function () {
  "use strict";

  function readFromQuery(key) {
    try {
      const qs = new URLSearchParams(window.location.search);
      const v = qs.get(key);
      return v && String(v).trim() ? String(v).trim() : null;
    } catch {
      return null;
    }
  }

  function readFromStorage(key) {
    try {
      const v = window.localStorage.getItem(key);
      return v && String(v).trim() ? String(v).trim() : null;
    } catch {
      return null;
    }
  }

  function readFromInjected(key) {
    try {
      const env = window.__SAFE_SUPABASE_ENV;
      if (!env) return null;
      const v = env[key];
      return v && String(v).trim() ? String(v).trim() : null;
    } catch {
      return null;
    }
  }

  const DEFAULT_URL = "https://tzyvsqyyrsaulryfjnne.supabase.co";
  const DEFAULT_AUTH_DOMAIN = "safe.local";

  const url =
    readFromInjected("url") ||
    readFromQuery("supabaseUrl") ||
    readFromStorage("SAFE_SUPABASE_URL") ||
    DEFAULT_URL;
  const anonKey =
    readFromInjected("anonKey") ||
    readFromQuery("supabaseAnonKey") ||
    readFromStorage("SAFE_SUPABASE_ANON_KEY") ||
    "";
  const authDomain =
    readFromInjected("authDomain") ||
    readFromQuery("authDomain") || readFromStorage("SAFE_SUPABASE_AUTH_DOMAIN") || DEFAULT_AUTH_DOMAIN;

  window.SAFE_SUPABASE_CONFIG = {
    url,
    anonKey,
    authDomain,
  };

  // Helper para facilitar setup local
  window.safeSetSupabaseCreds = function safeSetSupabaseCreds(nextUrl, nextAnonKey) {
    try {
      if (nextUrl) window.localStorage.setItem("SAFE_SUPABASE_URL", String(nextUrl).trim());
      if (nextAnonKey) window.localStorage.setItem("SAFE_SUPABASE_ANON_KEY", String(nextAnonKey).trim());
      window.location.reload();
    } catch (e) {
      console.error("Falha ao salvar credenciais do Supabase no localStorage:", e);
    }
  };
})();

