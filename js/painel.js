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
          let senhasChamadas = []; // Senhas que foram chamadas pelos médicos
          
          if (window.safeSupabase) {
            // Buscar senhas pendentes (fila)
            const { data: pendentes, error: errorPendentes } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id')
              .eq('status', 'pendente')
              .is('medico_atendendo_id', null)
              .order('updated_at', { ascending: false })
              .limit(50);
            if (errorPendentes) throw errorPendentes;
            
            senhas = (Array.isArray(pendentes) ? pendentes : []).map((s) => ({
              senha: s.senha,
              nome: s.nome,
              cpf: s.cpf,
              status: s.status,
              data: s.updated_at || s.created_at,
              encaminhamento: s.encaminhamento || null,
              medicoAtendendo: null,
              medicoAtendendoEmail: null,
              medicoAtendendoId: null
            }));
            
            // Buscar senhas em atendimento (chamadas)
            const { data: emAtendimento, error: errorAtendimento } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,called_at,medico_atendendo_id,profiles!medico_atendendo_id(nome,specialty)')
              .eq('status', 'em_atendimento')
              .not('medico_atendendo_id', 'is', null)
              .order('called_at', { ascending: false })
              .limit(10);
            if (errorAtendimento) throw errorAtendimento;
            
            senhasChamadas = (Array.isArray(emAtendimento) ? emAtendimento : []).map((s) => ({
              senha: s.senha,
              nome: s.nome ? s.nome.replace(/ \[EM ATENDIMENTO - .+?\]$/, '') : 'Sem nome',
              cpf: s.cpf,
              status: s.status,
              data: s.called_at || s.updated_at || s.created_at,
              medicoAtendendoId: s.medico_atendendo_id,
              medicoNome: s.profiles?.nome || 'Médico',
              medicoEspecialidade: s.profiles?.specialty || null
            }));
          } else {
            // Fallback para backend antigo
            const res = await fetch(API_URL);
            const todasSenhas = await res.json();
            
            // Separar pendentes e chamadas
            senhas = todasSenhas.filter(s => {
              const status = s?.status || '';
              const temMedico = s?.medicoAtendendo && String(s.medicoAtendendo).trim().length > 0;
              return status === 'pendente' && !temMedico;
            });
            
            senhasChamadas = todasSenhas.filter(s => {
              const status = s?.status || '';
              const temMedico = s?.medicoAtendendo && String(s.medicoAtendendo).trim().length > 0;
              return status === 'em_atendimento' || (status === 'pendente' && temMedico);
            }).map(s => ({
              senha: s.senha,
              nome: s.nome ? s.nome.replace(/ \[EM ATENDIMENTO - .+?\]$/, '') : 'Sem nome',
              cpf: s.cpf,
              status: s.status,
              data: s.data,
              medicoNome: s.medicoAtendendo || 'Médico',
              medicoEspecialidade: null
            }));
          }
          
          const lista = document.getElementById("senhaLista");
          const semSenhas = document.getElementById("semSenhas");
          lista.innerHTML = "";
          
          // Função auxiliar para obter sala do médico (baseado no nome ou especialidade)
          function obterSalaMedico(medicoNome, especialidade) {
            // Mapeamento simples baseado no nome do médico
            // Em produção, isso deveria vir do banco de dados
            const salasPorNome = {
              'Dr. João Silva': 'Sala 01',
              'Dra. Maria Santos': 'Sala 02',
              'Dr. Carlos Oliveira': 'Sala 03',
              'Dra. Ana Costa': 'Sala 04',
              'Dr. Patricia Lima': 'Sala 05',
              'Dr. Roberto Alves': 'Sala 06',
              'Dra. Fernanda Souza': 'Sala 07',
              'Dr. Marcos Pereira': 'Sala 08',
              'Dra. Juliana Rocha': 'Sala 09',
              'Dr. Antonio Ferreira': 'Sala 10'
            };
            
            // Tentar encontrar por nome completo
            if (salasPorNome[medicoNome]) {
              return salasPorNome[medicoNome];
            }
            
            // Tentar encontrar por parte do nome
            for (const [nome, sala] of Object.entries(salasPorNome)) {
              if (medicoNome.includes(nome.split(' ')[1]) || nome.includes(medicoNome.split(' ')[1])) {
                return sala;
              }
            }
            
            // Fallback: usar especialidade ou padrão
            return especialidade ? `${especialidade} - Sala` : 'Sala de Atendimento';
          }
          
          // Exibir senhas chamadas primeiro (com destaque)
          if (senhasChamadas.length > 0) {
            senhasChamadas.forEach((s) => {
              const sala = obterSalaMedico(s.medicoNome, s.medicoEspecialidade);
              const item = document.createElement("div");
              item.className = "senha-item senha-chamada";
              item.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
              item.style.color = "white";
              item.style.border = "3px solid #34d399";
              item.style.boxShadow = "0 12px 40px rgba(16, 185, 129, 0.4)";
              
              item.innerHTML = `
                <div class="senha-info">
                  <div class="senha-numero" style="color: white; font-size: 64px;">${s.senha}</div>
                  <div class="senha-details">
                    <div class="senha-nome" style="color: white; font-size: 28px; font-weight: 700; margin-bottom: 12px;">${s.nome || "Sem nome"}</div>
                    <div style="color: rgba(255,255,255,0.95); font-size: 22px; font-weight: 600; margin-bottom: 8px;">
                      <i class="fas fa-door-open"></i> ${sala}
                    </div>
                    <div style="color: rgba(255,255,255,0.9); font-size: 20px; font-weight: 500;">
                      está chamando por gentileza
                    </div>
                  </div>
                </div>
              `;
              
              lista.appendChild(item);
            });
          }
          
          // Filtrar senhas pendentes (fila)
          const senhasVisiveis = Array.isArray(senhas)
            ? senhas.filter((s) => {
                const nomeOk = s?.nome != null && String(s.nome).trim().length > 0;
                const status = s?.status != null ? String(s.status).trim() : "";
                if (!nomeOk || status !== "pendente") return false;

                const nome = String(s?.nome || "");
                const temMarcadorAtendimento = / \[EM ATENDIMENTO - .+?\]$/.test(nome);
                const temMedicoAtendendo =
                  s?.medicoAtendendo != null && String(s.medicoAtendendo).trim().length > 0;
                if (temMarcadorAtendimento || temMedicoAtendendo) return false;

                const temEncaminhamentoDestino =
                  s?.encaminhamento && s.encaminhamento.medicoDestino && String(s.encaminhamento.medicoDestino).trim().length > 0;
                return !temEncaminhamentoDestino;
              })
            : [];

          // Exibir senhas pendentes (fila)
          if (senhasVisiveis.length > 0) {
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
          
          // Mostrar mensagem se não houver senhas
          if (senhasVisiveis.length === 0 && senhasChamadas.length === 0) {
            semSenhas.style.display = "block";
          } else {
            semSenhas.style.display = "none";
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
