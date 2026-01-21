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
        // Em produção, por padrão usamos o mesmo domínio do frontend (front+back no mesmo serviço).
        return isLocalhost
          ? 'http://localhost:3000/api/senhas/recentes'
          : `${window.location.origin}/api/senhas/recentes`;
      }
      
      const API_URL = getAPIUrl();
      
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
          let senhas = [];
          if (window.safeSupabase) {
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id')
              .eq('status', 'pendente')
              .is('medico_atendendo_id', null)
              .order('updated_at', { ascending: false })
              .limit(50);
            if (error) throw error;
            senhas = (Array.isArray(data) ? data : []).map((s) => ({
              senha: s.senha,
              nome: s.nome,
              cpf: s.cpf,
              status: s.status,
              data: s.updated_at || s.created_at,
              encaminhamento: s.encaminhamento || null,
              medicoAtendendo: null,
              medicoAtendendoEmail: null
            }));
          } else {
            const res = await fetch(API_URL);
            senhas = await res.json();
          }
          const lista = document.getElementById("senhaLista");
          const semSenhas = document.getElementById("semSenhas");
          lista.innerHTML = "";
          
          // No painel público, só mostramos a FILA geral:
          // - status pendente
          // - com nome
          // - NÃO chamado/em atendimento
          // - NÃO encaminhado (encaminhado deve aparecer apenas para o médico de destino)
          const senhasVisiveis = Array.isArray(senhas)
            ? senhas.filter((s) => {
                const nomeOk = s?.nome != null && String(s.nome).trim().length > 0;
                const status = s?.status != null ? String(s.status).trim() : "";
                if (!nomeOk || status !== "pendente") return false;

                // Segurança extra: se já foi "chamado", não pode aparecer aqui.
                // (mesmo se o status ainda estiver pendente por algum motivo)
                const nome = String(s?.nome || "");
                const temMarcadorAtendimento = / \[EM ATENDIMENTO - .+?\]$/.test(nome);
                const temMedicoAtendendo =
                  s?.medicoAtendendo != null && String(s.medicoAtendendo).trim().length > 0;
                if (temMarcadorAtendimento || temMedicoAtendendo) return false;

                // Se tem encaminhamento, não exibir no painel público (somente médico destino)
                const temEncaminhamentoDestino =
                  s?.encaminhamento && s.encaminhamento.medicoDestino && String(s.encaminhamento.medicoDestino).trim().length > 0;
                return !temEncaminhamentoDestino;
              })
            : [];

          if (senhasVisiveis.length === 0) {
            semSenhas.style.display = "block";
          } else {
            semSenhas.style.display = "none";
            
            // Ordena por data (mais recentes primeiro)
            senhasVisiveis.sort((a, b) => new Date(b.data) - new Date(a.data));
            
            senhasVisiveis.forEach((s) => {
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
