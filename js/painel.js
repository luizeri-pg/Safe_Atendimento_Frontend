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
          let encaminhadosExame = []; // Encaminhados para sala de exame (não é consultório)
          
          // Em produção, o Safari pode bloquear chamadas cross-site ao supabase.co.
          // O painel (TV) usa endpoints server-side no backend para evitar CORS.
          if (window.API_CONFIG?.BASE_URL) {
            const base = window.API_CONFIG.BASE_URL;
            const [pendRes, atendRes] = await Promise.all([
              fetch(`${base}/painel/pendentes`, { headers: { Accept: 'application/json' } }),
              fetch(`${base}/painel/em_atendimento`, { headers: { Accept: 'application/json' } })
            ]);
            if (!pendRes.ok) throw new Error(`Falha painel/pendentes (${pendRes.status})`);
            if (!atendRes.ok) throw new Error(`Falha painel/em_atendimento (${atendRes.status})`);

            const pendentes = await pendRes.json().catch(() => []);
            const emAtendimento = await atendRes.json().catch(() => []);

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

          function isEncaminhamentoExame(enc) {
            if (!enc || typeof enc !== 'object') return false;
            const tipo = String(enc.tipo || '').trim().toLowerCase();
            const sala = String(enc.salaDestino || '').trim().toLowerCase();
            return tipo === 'exame' || sala.startsWith('sala de exame');
          }
          
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
                      Dirija-se ao consultório
                    </div>
                  </div>
                </div>
              `;
              
              lista.appendChild(item);
            });
          }

          // Encaminhados para SALA DE EXAME (mostrar logo após "chamadas")
          if (Array.isArray(senhas) && senhas.length > 0) {
            encaminhadosExame = senhas
              .filter((s) => {
                const nomeOk = s?.nome != null && String(s.nome).trim().length > 0;
                const status = s?.status != null ? String(s.status).trim() : "";
                if (!nomeOk || status !== 'pendente') return false;
                return isEncaminhamentoExame(s.encaminhamento);
              })
              .sort((a, b) => new Date(b.data) - new Date(a.data))
              .slice(0, 10);
          }

          if (encaminhadosExame.length > 0) {
            encaminhadosExame.forEach((s) => {
              const salaExame = String(s?.encaminhamento?.salaDestino || 'Sala de exame').trim() || 'Sala de exame';
              const item = document.createElement("div");
              item.className = "senha-item senha-encaminhada-exame";
              item.style.background = "linear-gradient(135deg, #6366f1 0%, #7c3aed 100%)";
              item.style.color = "white";
              item.style.border = "3px solid rgba(255,255,255,0.35)";
              item.style.boxShadow = "0 12px 40px rgba(124, 58, 237, 0.35)";

              item.innerHTML = `
                <div class="senha-info">
                  <div class="senha-numero" style="color: white; font-size: 56px;">${s.senha}</div>
                  <div class="senha-details">
                    <div class="senha-nome" style="color: white; font-size: 24px; font-weight: 700; margin-bottom: 10px;">${s.nome || "Sem nome"}</div>
                    <div style="color: rgba(255,255,255,0.95); font-size: 20px; font-weight: 600; margin-bottom: 6px;">
                      <i class="fas fa-vials"></i> ${salaExame}
                    </div>
                    <div style="color: rgba(255,255,255,0.9); font-size: 18px; font-weight: 500;">
                      Encaminhado para exames
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
                const temEncaminhamentoExame = isEncaminhamentoExame(s?.encaminhamento);
                // Não mostrar na fila geral quando está encaminhado (para médico ou para exame)
                return !temEncaminhamentoDestino && !temEncaminhamentoExame;
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
          if (senhasVisiveis.length === 0 && senhasChamadas.length === 0 && encaminhadosExame.length === 0) {
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

      // Realtime (Supabase): atualiza o painel automaticamente.
      // Mantém polling como fallback (caso Realtime não esteja ativo/configurado).
      let __safeSenhasPollId = null;
      let __safeSenhasRealtimeChannel = null;
      let __safeSenhasRefreshTimer = null;

      function startSenhasPolling(ms) {
        try {
          if (__safeSenhasPollId) clearInterval(__safeSenhasPollId);
        } catch {}
        __safeSenhasPollId = setInterval(carregarSenhas, ms);
      }

      function scheduleSenhasRefresh() {
        try {
          if (__safeSenhasRefreshTimer) clearTimeout(__safeSenhasRefreshTimer);
        } catch {}
        __safeSenhasRefreshTimer = setTimeout(() => {
          carregarSenhas();
        }, 250);
      }

      function setupRealtimeSenhas() {
        const supa = window.safeSupabase;
        if (!supa || typeof supa.channel !== 'function') return false;
        if (window.__SAFE_REALTIME_SENHAS_PAINEL_BOUND) return true;
        window.__SAFE_REALTIME_SENHAS_PAINEL_BOUND = true;

        try {
          __safeSenhasRealtimeChannel = supa
            .channel('safe-senhas-painel')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'senhas' },
              () => scheduleSenhasRefresh()
            )
            .subscribe();

          window.addEventListener('beforeunload', () => {
            try {
              if (__safeSenhasRealtimeChannel && typeof supa.removeChannel === 'function') {
                supa.removeChannel(__safeSenhasRealtimeChannel);
              }
            } catch {}
          });
          return true;
        } catch (e) {
          console.warn('[Realtime] Falha ao assinar mudanças de senhas (painel):', e);
          return false;
        }
      }

      // Polling fallback:
      // - Sem Realtime: 2s (como antes)
      // - Com Realtime: 10s (só para resiliência)
      const hasRealtime = setupRealtimeSenhas();
      startSenhasPolling(hasRealtime ? 10000 : 2000);
      
      // Carrega dados iniciais
      carregarSenhas();
      
      // Verificar encaminhamento ao carregar a página
      setTimeout(verificarEncaminhamento, 300);
