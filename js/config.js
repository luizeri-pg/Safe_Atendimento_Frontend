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
    
    // Função para obter URL do SOC com data
    function getSOCUrl(data) {
        // Se não passar data, usa data de hoje
        if (!data) {
            const hoje = new Date();
            data = hoje.toISOString().split('T')[0]; // Formato YYYY-MM-DD
        }
        // URL fixa do SOC com parâmetro de data
        return `${API_BASE_URL}/soc?data=${data}`;
    }
    
    // Expor configuração global
    window.API_CONFIG = {
        BASE_URL: API_BASE_URL,
        getSOC_URL: getSOCUrl, // Função para obter URL do SOC com data
        SOC_BASE: `${API_BASE_URL}/soc`, // URL base do SOC (sem parâmetros)
        SENHAS_URL: `${API_BASE_URL}/senhas`,
        USUARIOS_URL: `${API_BASE_URL}/usuarios`
    };
    
    // Log removido em produção - usar console.error para debug se necessário
})();
