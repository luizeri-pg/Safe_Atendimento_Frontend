// Configuração da API (Railway) + override por querystring/localStorage
// - Override (sem redeploy do front):
//    1) Querystring: ?apiBase=https://SEU-SERVICO.up.railway.app
//    2) LocalStorage: localStorage.setItem('SAFE_API_BASE', 'https://SEU-SERVICO.up.railway.app')
(function() {
    'use strict';
    
    // Detectar se estamos em localhost
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
    
    // Default em produção: mesmo domínio onde o frontend está rodando
    // (quando front+back estão no mesmo serviço no Railway)
    const DEFAULT_PROD_BASE = window.location.origin;
    
    // Overridable base (sem /api)
    let overrideBase = null;
    try {
        const qs = new URLSearchParams(window.location.search);
        overrideBase = qs.get('apiBase') || window.localStorage.getItem('SAFE_API_BASE');
    } catch (e) {
        overrideBase = null;
    }
    
    const chosenBase = (overrideBase && String(overrideBase).trim())
        ? String(overrideBase).trim().replace(/\/+$/, '')
        : (isLocalhost ? 'http://localhost:3000' : DEFAULT_PROD_BASE);
    
    // URL base da API (com /api)
    const API_BASE_URL = chosenBase.endsWith('/api') ? chosenBase : `${chosenBase}/api`;
    
    function getHojeLocalISO() {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        const dd = String(hoje.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function extractFirstArray(value, maxDepth = 4) {
        if (Array.isArray(value)) return value;
        if (!value || typeof value !== 'object' || maxDepth <= 0) return null;

        const preferredKeys = ['dados', 'data', 'registros', 'results', 'resultado', 'itens', 'items', 'lista', 'list'];
        for (const k of preferredKeys) {
            if (Object.prototype.hasOwnProperty.call(value, k)) {
                const found = extractFirstArray(value[k], maxDepth - 1);
                if (found) return found;
            }
        }

        for (const v of Object.values(value)) {
            const found = extractFirstArray(v, maxDepth - 1);
            if (found) return found;
        }
        return null;
    }

    // Função para obter URL do SOC via backend (proxy).
    // Motivo: o SOC não libera CORS para localhost/outros domínios, então o browser não consegue chamar direto.
    function getSOCUrl(data) {
        const iso = data ? String(data).trim() : getHojeLocalISO(); // YYYY-MM-DD (data local)
        return `${API_BASE_URL}/soc?data=${encodeURIComponent(iso)}`;
    }
    
    // Expor configuração global
    window.API_CONFIG = {
        BASE_URL: API_BASE_URL,
        getSOC_URL: getSOCUrl, // Função para obter URL do SOC com data
        SOC_BASE: `${API_BASE_URL}/soc`, // URL base do SOC (sem parâmetros)
        extractFirstArray: extractFirstArray,
        SENHAS_URL: `${API_BASE_URL}/senhas`,
        USUARIOS_URL: `${API_BASE_URL}/usuarios`
    };
    
    // Log removido em produção - usar console.error para debug se necessário
})();
