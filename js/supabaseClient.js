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

    // Safari (e alguns modos de economia de energia) podem suspender WebSockets em background,
    // gerando "WebSocket is closed due to suspension.".
    // Quando a aba volta a ficar ativa, tentamos reconectar o Realtime para restabelecer assinaturas.
    const supa = window.safeSupabase;
    function reconnectRealtime(reason) {
      try {
        if (!supa || !supa.realtime) return;
        if (typeof supa.realtime.connect === "function") {
          supa.realtime.connect();
        }
      } catch (e) {
        console.warn("[Realtime] Falha ao reconectar:", reason, e);
      }
    }

    try {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reconnectRealtime("visibilitychange");
      });
      window.addEventListener("pageshow", () => reconnectRealtime("pageshow"));
      window.addEventListener("online", () => reconnectRealtime("online"));
    } catch {
      // ignora
    }
  } catch (e) {
    console.error("Erro ao inicializar Supabase client:", e);
    window.safeSupabase = null;
  }
})();

