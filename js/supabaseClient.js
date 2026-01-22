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
    // Em Safari (especialmente iOS/Low Power Mode), WebSocket pode ser suspenso e causar ruído/instabilidade.
    // Para garantir o "básico" (login e uso contínuo), desativamos Realtime no Safari e usamos polling.
    try {
      const ua = String(navigator.userAgent || "");
      const isSafari = /safari/i.test(ua) && !/chrome|crios|android/i.test(ua);
      if (isSafari) window.__SAFE_DISABLE_REALTIME = true;
    } catch {}

    // Backend-first:
    // O frontend não precisa manter sessão do Supabase no navegador (Safari é instável).
    // Mantemos `window.safeSupabase = null` por padrão e usamos o backend + SAFE_ACCESS_TOKEN.
    // (Se no futuro precisar reativar supabase-js no browser, reintroduza createClient aqui.)
    window.safeSupabase = null;
    return;

    // Safari (e alguns modos de economia de energia) podem suspender WebSockets em background,
    // gerando "WebSocket is closed due to suspension." no console.
    // Estratégia:
    // - Ao ocultar a aba: desconecta Realtime de forma limpa (evita "suspension")
    // - Ao voltar/ficar online: reconecta (restabelece assinaturas)
    const supa = window.safeSupabase;
    function disconnectRealtime(reason) {
      try {
        if (!supa || !supa.realtime) return;
        if (typeof supa.realtime.disconnect === "function") {
          supa.realtime.disconnect();
        }
      } catch (e) {
        console.warn("[Realtime] Falha ao desconectar:", reason, e);
      }
    }
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
        if (document.visibilityState === "hidden") {
          disconnectRealtime("visibilitychange:hidden");
          return;
        }
        if (document.visibilityState === "visible") reconnectRealtime("visibilitychange:visible");
      });
      window.addEventListener("pageshow", () => reconnectRealtime("pageshow"));
      window.addEventListener("pagehide", () => disconnectRealtime("pagehide"));
      window.addEventListener("online", () => reconnectRealtime("online"));
    } catch {
      // ignora
    }
  } catch (e) {
    console.error("Erro ao inicializar Supabase client:", e);
    window.safeSupabase = null;
  }
})();

