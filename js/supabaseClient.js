// Inicializa o cliente Supabase (browser).
// Requer:
// - Script UMD do Supabase carregado (window.supabase)
// - js/supabaseConfig.js carregado (window.SAFE_SUPABASE_CONFIG)
(function () {
  "use strict";

  function canInit() {
    return (
      typeof window !== "undefined" &&
      window.supabase &&
      window.SAFE_SUPABASE_CONFIG &&
      window.SAFE_SUPABASE_CONFIG.url &&
      window.SAFE_SUPABASE_CONFIG.anonKey
    );
  }

  if (!canInit()) {
    // Mantém compatibilidade: o app pode funcionar via backend antigo.
    window.safeSupabase = null;
    return;
  }

  const { url, anonKey } = window.SAFE_SUPABASE_CONFIG;

  try {
    window.safeSupabase = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (e) {
    console.error("Erro ao inicializar Supabase client:", e);
    window.safeSupabase = null;
  }
})();

