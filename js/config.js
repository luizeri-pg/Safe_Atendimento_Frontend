// Configuração da API - detecta automaticamente se deve usar backend local ou Railway
(function() {
    'use strict';
    
    // Detectar se estamos em localhost
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' ||
                       window.location.hostname === '';
    
    // URL base da API
    const API_BASE_URL = isLocalhost 
        ? 'http://localhost:3000/api'  // Backend local (ajuste a porta se necessário)
        : 'https://safeatendimento-production.up.railway.app/api';  // Backend Railway
    
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
    
    // Log para debug
    console.log('🚀 API Config carregada:', {
        hostname: window.location.hostname,
        isLocalhost: isLocalhost,
        baseURL: API_BASE_URL
    });
})();
