      // Aguardar configuração estar disponível
      function getAPIUrl() {
        // Se config já está disponível, usar ela
        if (window.API_CONFIG && window.API_CONFIG.SENHAS_URL) {
          return `${window.API_CONFIG.SENHAS_URL}/recentes`;
        }
        // Fallback: detectar localhost manualmente
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
        return isLocalhost 
          ? 'http://localhost:3000/api/senhas/recentes'
          : 'https://safeatendimento-production.up.railway.app/api/senhas/recentes';
      }
      
      const API_URL = getAPIUrl();
      console.log('🔧 API_URL configurada:', API_URL);
      
      // Verificar se há encaminhamento para exibir
      function verificarEncaminhamento() {
        const urlParams = new URLSearchParams(window.location.search);
        const encaminhamentoParam = urlParams.get('encaminhamento');
        
        if (encaminhamentoParam === 'true') {
          const encaminhamentoData = localStorage.getItem('encaminhamento');
          
          if (encaminhamentoData) {
            try {
              // Limpar localStorage após processar
              localStorage.removeItem('encaminhamento');
              
              // Limpar parâmetros da URL
              window.history.replaceState({}, document.title, window.location.pathname);
            } catch (e) {
              console.error('Erro ao processar encaminhamento:', e);
            }
          }
        }
      }
      
      async function carregarSenhas() {
        try {
          const res = await fetch(API_URL);
          const senhas = await res.json();
          const lista = document.getElementById("senhaLista");
          const semSenhas = document.getElementById("semSenhas");
          lista.innerHTML = "";
          
          if (senhas.length === 0) {
            semSenhas.style.display = "block";
          } else {
            semSenhas.style.display = "none";
            
            // Ordena por data (mais recentes primeiro)
            senhas.sort((a, b) => new Date(b.data) - new Date(a.data));
            
            senhas.forEach((s) => {
              const item = document.createElement("div");
              item.className = "senha-item";
              
              let statusBadge = "";
              if (s.status === "atendida") {
                statusBadge = '<span class="status-badge status-atendida">Atendida</span>';
              } else if (s.status === "cadastro") {
                statusBadge = '<span class="status-badge status-cadastro">Cadastro</span>';
              } else {
                statusBadge = '<span class="status-badge status-pendente">Pendente</span>';
              }
              
              item.innerHTML = `
                <div class="senha-info">
                  <div class="senha-numero">${s.senha}</div>
                  <div class="senha-details">
                    <div class="senha-nome">${s.nome || "Sem agendamento"}</div>
                    <div class="senha-status">${statusBadge}</div>
                  </div>
                </div>
              `;
              
              lista.appendChild(item);
            });
          }
        } catch (e) {
          console.error("Erro ao carregar senhas:", e);
          document.getElementById("semSenhas").innerHTML = `
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Erro ao carregar dados</h3>
            <p>Verifique sua conexão e tente novamente</p>
          `;
          document.getElementById("semSenhas").style.display = "block";
        }
      }

      function logout() {
        if (confirm('Deseja realmente sair do sistema?')) {
          window.location.href = 'login.html';
        }
      }

      // Atualização automática a cada 2 segundos
      setInterval(carregarSenhas, 2000);
      
      // Carrega dados iniciais
      carregarSenhas();
      
      // Verificar encaminhamento ao carregar a página
      setTimeout(verificarEncaminhamento, 300);
