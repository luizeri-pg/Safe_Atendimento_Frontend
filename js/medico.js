      // Aguardar configuração estar disponível
      function getAPIUrl() {
        // Se config já está disponível, usar ela
        if (window.API_CONFIG && window.API_CONFIG.SENHAS_URL) {
          return window.API_CONFIG.SENHAS_URL;
        }
        // Fallback: detectar localhost manualmente
        const hostname = window.location && window.location.hostname;
        const isLocalhost = hostname === 'localhost' || 
                           hostname === '127.0.0.1' ||
                           !hostname || // null, undefined ou string vazia
                           hostname === '';
        
        const url = isLocalhost 
          ? 'http://localhost:3000/api/senhas'
          : `${window.location.origin}/api/senhas`;
        
        return url;
      }
      
      const API_URL = getAPIUrl();
      let pacienteAtual = null;
      let estatisticas = {
        totalAtendidos: 0,
        tempoMedio: 0,
        inicioConsulta: null
      };

      // Guard de acesso: somente perfis de atendimento (consultório/exames)
      (function enforceAtendimento() {
        try {
          const logged = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          const role = String(logged?.role || '').trim();
          const allowed = new Set(['medico', 'enfermagem', 'fono']);
          if (!role || !allowed.has(role)) {
            window.location.href = 'login.html';
          }
        } catch {
          window.location.href = 'login.html';
        }
      })();

      // Identidade do usuário (médico/enfermagem/fono) baseada no login
      const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
      const loggedRole = String(loggedUser?.role || '').trim();
      function displayNomeAtendimento() {
        const base = String(loggedUser?.nome || loggedUser?.username || '').trim();
        if (loggedRole === 'medico') {
          if (!base) return 'Dr. Médico';
          return /^dr\.?\s/i.test(base) ? base : `Dr. ${base}`;
        }
        if (base) return base;
        if (loggedRole === 'enfermagem') return 'Enfermagem';
        if (loggedRole === 'fono') return 'Fonoaudiologia';
        return 'Atendimento';
      }
      function displayLocalAtendimento() {
        if (loggedRole === 'medico') return 'Consultório';
        if (loggedRole === 'enfermagem') return 'Exames 1 e 2';
        if (loggedRole === 'fono') return 'Exames 3';
        return 'Atendimento';
      }
      document.getElementById('medicoNome').textContent = displayNomeAtendimento();
      document.getElementById('medicoEspecialidade').textContent = displayLocalAtendimento();

      // Verificar se há paciente vindo do atendente e destacar na fila
      function verificarPacienteAtendente() {
        const urlParams = new URLSearchParams(window.location.search);
        const senhaParam = urlParams.get('senha');
        
        if (senhaParam) {
          // Limpar localStorage após processar (o paciente já está na fila)
          const pacienteData = localStorage.getItem('pacienteAtendimento');
          if (pacienteData) {
            localStorage.removeItem('pacienteAtendimento');
          }
          
          // Limpar parâmetro da URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }

      async function carregarFila() {
        try {
          // Obter médico atual logado
          const medicoAtualNome = document.getElementById('medicoNome').textContent.trim();
          const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          const myId = loggedUser?.id || null;
          const myRole = String(loggedUser?.role || '').trim();

          function normalizeRoom(s) {
            return String(s || '').trim().toLowerCase();
          }
          function isEncaminhamentoExame(enc) {
            if (!enc) return false;
            const tipo = String(enc.tipo || '').trim().toLowerCase();
            const sala = normalizeRoom(enc.salaDestino || '');
            return tipo === 'exame' || sala.startsWith('sala de exame') || sala.startsWith('exames');
          }
          function matchesExamRoom(enc) {
            const sala = normalizeRoom(enc?.salaDestino || '');
            if (!sala) return false;
            if (myRole === 'enfermagem') {
              return sala.includes('exame 1') || sala.includes('exames 1') || sala.includes('exame 2') || sala.includes('exames 2');
            }
            if (myRole === 'fono') {
              return sala.includes('exame 3') || sala.includes('exames 3');
            }
            return false;
          }

          // Fonte de dados: Supabase (preferencial) ou backend antigo (fallback)
          let senhas = [];
          if (window.safeSupabase) {
            // Cache simples de profiles (para resolver ids → nomes sem fazer N queries)
            if (!window.__SAFE_PROFILES_CACHE) {
              window.__SAFE_PROFILES_CACHE = { fetchedAt: 0, byId: {} };
            }
            async function getProfilesById() {
              const cache = window.__SAFE_PROFILES_CACHE;
              const now = Date.now();
              if (cache.fetchedAt && now - cache.fetchedAt < 60_000 && cache.byId) return cache.byId;
              const { data: profiles, error: profErr } = await window.safeSupabase
                .from('profiles')
                .select('id,nome')
                .order('nome', { ascending: true });
              if (profErr) {
                // Se falhar, mantém o cache antigo (se houver) e segue
                return cache.byId || {};
              }
              const byId = {};
              (Array.isArray(profiles) ? profiles : []).forEach((p) => {
                if (p?.id) byId[String(p.id)] = String(p.nome || '').trim() || String(p.id);
              });
              cache.fetchedAt = now;
              cache.byId = byId;
              return byId;
            }

            const profilesById = await getProfilesById();
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,called_at,encaminhamento,medico_atendendo_id')
              .in('status', ['pendente', 'em_atendimento', 'atendida'])
              .order('updated_at', { ascending: false })
              .limit(200);
            if (error) throw error;

            senhas = (Array.isArray(data) ? data : []).map((s) => {
              const rawEnc = s.encaminhamento || null;
              const origemId = rawEnc?.medicoOrigemId || null;
              const destinoId = rawEnc?.medicoDestinoId || null;
              const enc = rawEnc
                ? {
                    tipo: rawEnc.tipo || null,
                    // compat com código legado (que espera strings)
                    medicoOrigem: rawEnc.medicoOrigem || (origemId ? (profilesById[String(origemId)] || origemId) : null),
                    medicoDestino: rawEnc.medicoDestino || (destinoId ? (profilesById[String(destinoId)] || destinoId) : null),
                    salaDestino: rawEnc.salaDestino || null,
                    motivo: rawEnc.motivo || null,
                    aceito: rawEnc.aceito === true,
                    // ids explícitos (para comparações)
                    medicoOrigemId: origemId,
                    medicoDestinoId: destinoId,
                    createdAt: rawEnc.createdAt || null,
                    acceptedAt: rawEnc.acceptedAt || null
                  }
                : null;

              return {
                senha: s.senha,
                nome: s.nome,
                cpf: s.cpf,
                status: s.status,
                data: s.called_at || s.updated_at || s.created_at,
                encaminhamento: enc,
                medicoAtendendo:
                  s.medico_atendendo_id && myId && s.medico_atendendo_id === myId
                    ? medicoAtualNome
                    : s.medico_atendendo_id
                      ? 'Outro médico'
                      : null,
                medicoAtendendoEmail: null,
                medico_atendendo_id: s.medico_atendendo_id
              };
            });
          } else {
            // Usar função getAPIUrl para garantir URL correta a cada chamada
            const url = getAPIUrl();
            const res = await fetch(url);
            senhas = await res.json();
          }

          // Se existir paciente EM ATENDIMENTO deste médico no banco,
          // re-hidrata o "Paciente Atual" após reload (para permitir encaminhar/finalizar).
          if (window.safeSupabase && myId) {
            const ativo = (Array.isArray(senhas) ? senhas : []).find(
              (s) => s && s.status === 'em_atendimento' && s.medico_atendendo_id && String(s.medico_atendendo_id) === String(myId)
            );

            if (ativo && (!pacienteAtual || pacienteAtual.senha !== ativo.senha)) {
              pacienteAtual = {
                senha: ativo.senha,
                nome: ativo.nome,
                cpf: ativo.cpf,
                status: ativo.status,
                data: ativo.data,
                encaminhamento: ativo.encaminhamento || null,
                medico_atendendo_id: ativo.medico_atendendo_id || null
              };
              estatisticas.inicioConsulta = ativo.data ? new Date(ativo.data) : new Date();

              document.getElementById('senhaAtual').textContent = pacienteAtual.senha;
              document.getElementById('nomeAtual').textContent = pacienteAtual.nome || 'Sem nome';
              document.getElementById('cpfAtual').textContent = pacienteAtual.cpf || 'Sem CPF';
              const pacienteAtualEl = document.getElementById('pacienteAtual');
              pacienteAtualEl.classList.remove('hidden');
              pacienteAtualEl.classList.add('block');

              document.getElementById('btnFinalizarConsulta').disabled = false;
              document.getElementById('btnEncaminharPaciente').disabled = false;
              document.getElementById('btnChamarProximo').disabled = true;

              const acoesPaciente = document.getElementById('acoesPaciente');
              acoesPaciente.classList.remove("hidden");
              acoesPaciente.classList.add("block");
            }

            // Se não há mais ativo no banco, mas a UI ficou com um paciente antigo,
            // limpa para evitar travar botões.
            if (!ativo && pacienteAtual && pacienteAtual.medico_atendendo_id && String(pacienteAtual.medico_atendendo_id) === String(myId)) {
              pacienteAtual = null;
              estatisticas.inicioConsulta = null;
              const pacienteAtualEl = document.getElementById('pacienteAtual');
              pacienteAtualEl.classList.add('hidden');
              pacienteAtualEl.classList.remove('block');
              document.getElementById('btnFinalizarConsulta').disabled = true;
              document.getElementById('btnEncaminharPaciente').disabled = true;
              document.getElementById('btnChamarProximo').disabled = false;
              const acoesPaciente = document.getElementById('acoesPaciente');
              acoesPaciente.classList.add("hidden");
              acoesPaciente.classList.remove("block");
            }
          }
          
          // Filtra senhas pendentes E que foram encaminhadas para este médico OU não foram encaminhadas
          const filaPendentes = senhas.filter(s => {
            if (s.status !== 'pendente') {
              return false;
            }

            // Enfermagem/Fono: trabalham APENAS com encaminhamentos de exame (por sala)
            if (myRole === 'enfermagem' || myRole === 'fono') {
              if (!isEncaminhamentoExame(s.encaminhamento)) return false;
              if (!matchesExamRoom(s.encaminhamento)) return false;
              if (window.safeSupabase && s.medico_atendendo_id) return false;
              return true;
            }
            
            // Encaminhado para SALA DE EXAME não deve aparecer na fila de médicos
            if (s.encaminhamento) {
              if (isEncaminhamentoExame(s.encaminhamento)) return false;
            }

            // Se o Supabase estiver ativo, usamos o campo medico_atendendo_id (fonte de verdade)
            if (window.safeSupabase) {
              if (s.medico_atendendo_id) {
                // Se está em atendimento (por qualquer médico), não aparece na fila
                return false;
              }
            } else {
              // Fallback legacy: filtrar pelo marcador e campos antigos
              let medicoAtendendo = s.medicoAtendendo;
              let medicoAtendendoEmail = s.medicoAtendendoEmail;

              const nomeCompleto = s.nome || '';
              const marcadorRegex = / \[EM ATENDIMENTO - (.+?)\]$/;
              const matchMarcador = nomeCompleto.match(marcadorRegex);
              if (matchMarcador) {
                const medicoDoMarcador = matchMarcador[1];
                if (!medicoAtendendo || medicoAtendendo.trim() === '') {
                  medicoAtendendo = medicoDoMarcador;
                }
              }

              const chaveMedicoAtendendo = `medicoAtendendo_${s.senha}`;
              const dadosLocalStorage = localStorage.getItem(chaveMedicoAtendendo);
              if (dadosLocalStorage && (!medicoAtendendo || medicoAtendendo.trim() === '')) {
                try {
                  const dados = JSON.parse(dadosLocalStorage);
                  const agora = new Date();
                  const timestampAtendimento = new Date(dados.timestamp);
                  const diferencaMinutos = (agora - timestampAtendimento) / 60000;
                  if (diferencaMinutos < 30) {
                    medicoAtendendo = dados.medico;
                    medicoAtendendoEmail = dados.email;
                  }
                } catch (e) {
                  console.warn('❌ Erro ao ler localStorage:', e);
                }
              }

              if (medicoAtendendo && medicoAtendendo.trim() !== '') {
                const medicoAtendendoTrim = medicoAtendendo.trim();
                const mesmoMedicoPorNome = medicoAtendendoTrim === medicoAtualNome;
                let mesmoMedicoPorEmail = false;
                if (loggedUser.email && medicoAtendendoEmail) {
                  mesmoMedicoPorEmail = medicoAtendendoEmail.trim() === loggedUser.email.trim();
                }
                if (!mesmoMedicoPorNome && !mesmoMedicoPorEmail) {
                  return false;
                }
                return false;
              }
            }
            
            // Se tem encaminhamento, verificar se foi encaminhado para este médico
            if (s.encaminhamento && s.encaminhamento.medicoDestino) {
              if (window.safeSupabase) {
                const destinoId = s.encaminhamento.medicoDestinoId || s.encaminhamento.medicoDestino;
                // Encaminhado para outro médico -> não mostrar
                if (destinoId && myId && String(destinoId) !== String(myId)) return false;
                // Encaminhado para mim -> mostrar
                return true;
              } else {
                const medicoDestino = s.encaminhamento.medicoDestino.trim();
                // Comparar por nome ou email do médico atual
                const encaminhadoParaEste = medicoDestino === medicoAtualNome || 
                       medicoDestino.includes(medicoAtualNome) ||
                       (loggedUser.email && medicoDestino.includes(loggedUser.email));
                
                // Se foi encaminhado para este médico, mostrar (mesmo que não aceito ainda)
                if (encaminhadoParaEste) {
                  return true; // Mostrar na fila (para aceitar se não aceito, ou chamar se aceito)
                }
                // Se foi encaminhado para outro médico, não mostrar
                return false;
              }
            }
            
            // Se não tem encaminhamento e não está sendo atendido por ninguém, mostrar (paciente novo)
            return true;
          });
          
          const lista = document.getElementById("senhaLista");
          const semPacientes = document.getElementById("semPacientes");
          
          lista.innerHTML = "";
          
          if (filaPendentes.length === 0) {
            semPacientes.classList.remove("hidden");
            semPacientes.classList.add("block");
          } else {
            semPacientes.classList.add("hidden");
            semPacientes.classList.remove("block");
            
            filaPendentes.forEach((s, index) => {
              // Não mostrar na fila o paciente que está atualmente em atendimento localmente
              // (o filtro já removeu pacientes atendidos por outros médicos)
              if (pacienteAtual && pacienteAtual.senha === s.senha) {
                return; // Pula este paciente, ele já está sendo atendido localmente
              }
              
              const item = document.createElement("div");
              item.className = "senha-item bg-white rounded-2xl py-5 px-6 flex items-center justify-between text-2xl font-semibold shadow-md text-blue-500 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl md:flex-row flex-col gap-3 text-center md:text-left";
              
              const tempoEspera = calcularTempoEspera(s.data);
              
              // Verifica se o paciente foi encaminhado
              const foiEncaminhado = s.encaminhamento && s.encaminhamento.medicoOrigem;
              const foiAceito = s.encaminhamento && s.encaminhamento.aceito === true;
              const medicoOrigem = s.encaminhamento ? s.encaminhamento.medicoOrigem : null;
              const motivoEncaminhamento = s.encaminhamento ? s.encaminhamento.motivo : null;
              
              let indicadorEncaminhado = '';
              let botaoAcao = '';
              
              if (foiEncaminhado && !foiAceito) {
                // Paciente encaminhado mas ainda não aceito - mostrar botão de aceitar
                indicadorEncaminhado = `
                  <div class="status-encaminhado bg-orange-500 text-white py-2 px-3 rounded-lg mt-2 text-xs">
                    <i class="fas fa-arrow-right"></i> Encaminhado por <strong>${medicoOrigem}</strong>
                    ${motivoEncaminhamento ? `<br><small>Motivo: ${motivoEncaminhamento}</small>` : ''}
                  </div>
                `;
                botaoAcao = `
                  <button class="btn-aceitar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="aceitarEncaminhamento('${s.senha}')">
                    <i class="fas fa-check"></i> Aceitar
                  </button>
                `;
              } else if (foiEncaminhado && foiAceito) {
                // Paciente encaminhado e já aceito - mostrar normalmente
                indicadorEncaminhado = `
                  <div class="status-encaminhado bg-green-500 text-white py-2 px-3 rounded-lg mt-2 text-xs">
                    <i class="fas fa-check-circle"></i> Encaminhado por ${medicoOrigem} (Aceito)
                  </div>
                `;
                botaoAcao = `
                  <button class="btn-chamar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="chamarPaciente('${s.senha}')">
                    Chamar
                  </button>
                `;
              } else {
                // Paciente normal
                botaoAcao = `
                  <button class="btn-chamar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="chamarPaciente('${s.senha}')">
                    Chamar
                  </button>
                `;
              }
              
              // Remover marcador do nome para exibição
              const nomeExibicao = (s.nome || 'Sem nome').replace(/ \[EM ATENDIMENTO - .+?\]$/, '');
              
              item.innerHTML = `
                <div>
                  <div class="senha-numero text-3xl font-black text-blue-500">${s.senha}</div>
                  <div class="senha-nome text-xl font-medium text-gray-800">${nomeExibicao}</div>
                  ${indicadorEncaminhado}
                </div>
                <div class="senha-tempo text-base text-gray-600 font-normal">${tempoEspera}</div>
                ${botaoAcao}
              `;
              
              lista.appendChild(item);
            });
          }
          
          // Atualiza estatísticas
          atualizarEstatisticas(senhas);
          
        } catch (e) {
          console.error("Erro ao carregar fila:", e);
        }
      }

      function calcularTempoEspera(dataCriacao) {
        const agora = new Date();
        const criacao = new Date(dataCriacao);
        const diffMs = agora - criacao;
        const diffMinutos = Math.floor(diffMs / 60000);
        
        if (diffMinutos < 1) return 'Agora';
        if (diffMinutos < 60) return `${diffMinutos}min`;
        
        const horas = Math.floor(diffMinutos / 60);
        const minutos = diffMinutos % 60;
        return `${horas}h ${minutos}min`;
      }

      function atualizarEstatisticas(senhas) {
        const atendidas = senhas.filter(s => s.status === 'atendida').length;
        // Se houver paciente em atendimento, não contar ele na fila
        let pendentes = senhas.filter(s => s.status === 'pendente');
        if (pacienteAtual) {
          pendentes = pendentes.filter(s => s.senha !== pacienteAtual.senha);
        }
        
        document.getElementById('totalAtendidos').textContent = atendidas;
        document.getElementById('naFila').textContent = pendentes.length;
        
        // Calcula tempo médio (simulado)
        const tempoMedio = atendidas > 0 ? Math.floor(15 + Math.random() * 10) : 0;
        document.getElementById('tempoMedio').textContent = `${tempoMedio}min`;
      }

      // Função antiga removida - usando a versão enhanced abaixo

      async function chamarProximoPaciente() {
        try {
          // Obter médico atual
          const medicoAtualNome = document.getElementById('medicoNome').textContent.trim();
          const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          const myId = loggedUser?.id || null;
          const myRole = String(loggedUser?.role || '').trim();

          function normalizeRoom(s) {
            return String(s || '').trim().toLowerCase();
          }
          function isEncaminhamentoExame(enc) {
            if (!enc) return false;
            const tipo = String(enc.tipo || '').trim().toLowerCase();
            const sala = normalizeRoom(enc.salaDestino || '');
            return tipo === 'exame' || sala.startsWith('sala de exame') || sala.startsWith('exames');
          }
          function matchesExamRoom(enc) {
            const sala = normalizeRoom(enc?.salaDestino || '');
            if (!sala) return false;
            if (myRole === 'enfermagem') {
              return sala.includes('exame 1') || sala.includes('exames 1') || sala.includes('exame 2') || sala.includes('exames 2');
            }
            if (myRole === 'fono') {
              return sala.includes('exame 3') || sala.includes('exames 3');
            }
            return false;
          }

          let proximo = null;
          if (window.safeSupabase) {
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,encaminhamento,medico_atendendo_id,status,updated_at,created_at')
              .eq('status', 'pendente')
              .is('medico_atendendo_id', null)
              .order('updated_at', { ascending: true }) // mais antigas primeiro
              .limit(50);
            if (error) throw error;

            const lista = Array.isArray(data) ? data : [];
            proximo = lista.find((s) => {
              const enc = s.encaminhamento || null;
              if (myRole === 'enfermagem' || myRole === 'fono') {
                if (!isEncaminhamentoExame(enc)) return false;
                if (!matchesExamRoom(enc)) return false;
                return true;
              }

              // Médico (consultório): não chamar encaminhamentos de exame
              if (isEncaminhamentoExame(enc)) return false;
              const destino = enc?.medicoDestinoId || enc?.medicoDestino || null;
              if (destino && myId && String(destino) !== String(myId)) return false;
              return true;
            });
          } else {
            const url = getAPIUrl();
            const res = await fetch(url);
            const senhas = await res.json();
            // Buscar próximo paciente disponível (não está sendo atendido por outro médico)
            proximo = senhas.find(s => {
              if (s.status !== 'pendente') return false;

              // Enfermagem/Fono (legacy): somente exames por sala
              if (myRole === 'enfermagem' || myRole === 'fono') {
                if (!isEncaminhamentoExame(s.encaminhamento)) return false;
                if (!matchesExamRoom(s.encaminhamento)) return false;
                return true;
              }
              
              // Médico (consultório): não chamar encaminhamentos de exame
              if (isEncaminhamentoExame(s.encaminhamento)) return false;

              if (s.medicoAtendendo && s.medicoAtendendo !== medicoAtualNome) {
                if (loggedUser.email && s.medicoAtendendoEmail && s.medicoAtendendoEmail !== loggedUser.email) {
                  return false;
                }
                if (!loggedUser.email || !s.medicoAtendendoEmail) {
                  return false;
                }
              }
              
              if (s.encaminhamento && s.encaminhamento.medicoDestino) {
                const medicoDestino = s.encaminhamento.medicoDestino;
                return medicoDestino === medicoAtualNome || 
                       medicoDestino.includes(medicoAtualNome) ||
                       (loggedUser.email && medicoDestino.includes(loggedUser.email));
              }
              return true;
            });
          }
          
          if (proximo) {
            await chamarPaciente(proximo.senha);
          } else {
            alert('Não há pacientes disponíveis na fila!');
          }
        } catch (e) {
          console.error("Erro ao chamar próximo paciente:", e);
        }
      }


      function atualizarFila() {
        carregarFila();
      }


      // Logout function
      function logout() {
        if (confirm('Deseja realmente sair do sistema?')) {
          window.location.href = 'login.html';
        }
      }

      // Enhanced functions with notifications
      async function chamarPaciente(senha) {
        try {
          // Busca dados do paciente
          let paciente = null;
          if (window.safeSupabase) {
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id')
              .eq('senha', senha)
              .single();
            if (error) throw error;
            paciente = data
              ? {
                  senha: data.senha,
                  nome: data.nome,
                  cpf: data.cpf,
                  status: data.status,
                  data: data.updated_at || data.created_at,
                  encaminhamento: data.encaminhamento || null,
                  medico_atendendo_id: data.medico_atendendo_id || null
                }
              : null;
          } else {
            const url = getAPIUrl();
            const res = await fetch(url);
            const senhas = await res.json();
            paciente = senhas.find(s => s.senha === senha);
          }
          
          if (paciente) {
            // Obter informações do médico atual primeiro
            const medicoAtualNome = document.getElementById('medicoNome').textContent;
            const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
            
            if (window.safeSupabase) {
              // Chamada ATÔMICA via RPC (impede dois médicos chamarem a mesma senha)
              const { data: called, error: callErr } = await window.safeSupabase.rpc('chamar_senha', {
                p_senha: senha
              });
              if (callErr) {
                alert('Esta senha não está mais disponível (já foi chamada ou não pode ser chamada).');
                carregarFila();
                return;
              }
              // Atualiza dados do paciente com retorno da RPC
              paciente.status = called.status;
              paciente.medico_atendendo_id = called.medico_atendendo_id;
            } else {
              // Fluxo legacy permanece (backend antigo)
              // (mantido sem mudanças)
              try {
                const url = getAPIUrl();
                const timestampAtual = new Date().toISOString();
                const nomeOriginal = paciente.nome || 'Sem nome';
                const marcadorRegex = / \[EM ATENDIMENTO - .+?\]$/;
                const nomeSemMarcador = nomeOriginal.replace(marcadorRegex, '');
                const nomeComMarcador = `${nomeSemMarcador} [EM ATENDIMENTO - ${medicoAtualNome}]`;

                const dadosParaSalvar = { 
                  medicoAtendendo: medicoAtualNome,
                  medicoAtendendoEmail: loggedUser.email || null,
                  nome: nomeComMarcador,
                  status: "em_atendimento",
                  data: timestampAtual
                };

                const response = await fetch(`${url}/${encodeURIComponent(senha)}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(dadosParaSalvar),
                });
                if (!response.ok) throw new Error(`Erro ao salvar no backend: ${response.status}`);

                paciente.medicoAtendendo = medicoAtualNome;
                paciente.medicoAtendendoEmail = loggedUser.email || null;
                paciente.data = timestampAtual;
                paciente.nomeOriginal = nomeSemMarcador;
                paciente.nome = nomeSemMarcador;
              } catch (e) {
                console.error("❌ Erro ao salvar médico atendendo no backend:", e);
                alert('Erro ao salvar no servidor. Tente novamente.');
                return;
              }
            }
            
            // Atualizar dados locais apenas após salvar no backend
            pacienteAtual = paciente;
            estatisticas.inicioConsulta = new Date();
            
            // Atualiza interface
            document.getElementById('senhaAtual').textContent = paciente.senha;
            document.getElementById('nomeAtual').textContent = paciente.nome || 'Sem nome';
            document.getElementById('cpfAtual').textContent = paciente.cpf || 'Sem CPF';
            // Mostrar card do paciente em atendimento (Tailwind usa `hidden`)
            const pacienteAtualEl = document.getElementById('pacienteAtual');
            pacienteAtualEl.classList.remove('hidden');
            pacienteAtualEl.classList.add('block');
            
            // Habilita botões de controle
            document.getElementById('btnFinalizarConsulta').disabled = false;
            document.getElementById('btnEncaminharPaciente').disabled = false;
            document.getElementById('btnChamarProximo').disabled = true;
            
            // Mostra ações do paciente
            const acoesPaciente = document.getElementById('acoesPaciente');
            acoesPaciente.classList.remove("hidden");
            acoesPaciente.classList.add("block");
            
            // Aguardar um pouco e atualizar fila (para garantir que o backend processou)
            // Isso garante que outros médicos vejam que o paciente foi chamado
            setTimeout(() => {
            carregarFila();
            }, 500);
          }
        } catch (e) {
          console.error("Erro ao chamar paciente:", e);
        }
      }

      async function finalizarConsulta() {
        if (!pacienteAtual) return;
        
        // Confirmação mais detalhada
        const confirmacao = confirm(
          `Finalizar atendimento do paciente ${pacienteAtual.nome} (Senha: ${pacienteAtual.senha})?\n\n` +
          `⚠️ ATENÇÃO: Após finalizar, o paciente sairá do sistema e não poderá mais ser atendido hoje.\n\n` +
          `Certifique-se de que:\n` +
          `• Todos os exames necessários foram realizados\n` +
          `• O paciente não precisa de outros médicos\n` +
          `• O atendimento está completo`
        );
        
        if (!confirmacao) return;
        
        try {
          if (window.safeSupabase) {
            const { error } = await window.safeSupabase.rpc('finalizar_senha', { p_senha: pacienteAtual.senha });
            if (error) throw error;
          } else {
            const url = getAPIUrl();
            await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                status: "atendida",
                medicoAtendendo: null,
                medicoAtendendoEmail: null
              }),
            });
          }
          
          // Calcula tempo de consulta
          if (estatisticas.inicioConsulta) {
            const tempoConsulta = Math.floor((new Date() - estatisticas.inicioConsulta) / 60000);
            // Tempo de consulta calculado (pode ser usado para estatísticas futuras)
          }
          
          // Legacy cleanup de marcador/localStorage
          if (!window.safeSupabase && pacienteAtual && pacienteAtual.senha) {
            const nomeOriginal = pacienteAtual.nomeOriginal || pacienteAtual.nome || 'Sem nome';
            const nomeSemMarcador = nomeOriginal.replace(/ \[EM ATENDIMENTO - .+?\]$/, '');
            try {
              const url = getAPIUrl();
              await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  nome: nomeSemMarcador,
                  status: "atendida",
                  medicoAtendendo: null,
                  medicoAtendendoEmail: null
                }),
              });
            } catch (e) {
              console.warn('Erro ao remover marcador:', e);
            }
            const chaveMedicoAtendendo = `medicoAtendendo_${pacienteAtual.senha}`;
            localStorage.removeItem(chaveMedicoAtendendo);
          }
          
          // Limpa paciente atual
          pacienteAtual = null;
          estatisticas.inicioConsulta = null;
          
          // Atualiza interface
          const pacienteAtualEl = document.getElementById('pacienteAtual');
          pacienteAtualEl.classList.add('hidden');
          pacienteAtualEl.classList.remove('block');
          document.getElementById('btnFinalizarConsulta').disabled = true;
          document.getElementById('btnEncaminharPaciente').disabled = true;
          document.getElementById('btnChamarProximo').disabled = false;
          
          // Oculta ações
          const acoesPaciente = document.getElementById('acoesPaciente');
          acoesPaciente.classList.add("hidden");
          acoesPaciente.classList.remove("block");
          
          // Atualiza fila
          carregarFila();
          
        } catch (e) {
          console.error("Erro ao finalizar consulta:", e);
        }
      }

      // Funções para gerenciar exames e encaminhamentos
      async function carregarHistoricoExames(senha) {
        try {
          const res = await fetch(`${API_URL.replace('/senhas', '')}/exames/${senha}`);
          const exames = await res.json();
          
          const examesLista = document.getElementById('examesLista');
          examesLista.innerHTML = '';
          
          if (exames.length === 0) {
            examesLista.innerHTML = '<div style="text-align: center; color: #666; padding: 20px;">Nenhum exame registrado ainda.</div>';
            return;
          }
          
          exames.forEach(exame => {
            const exameItem = document.createElement('div');
            exameItem.className = 'exame-item';
            
            const dataFormatada = new Date(exame.data).toLocaleString('pt-BR');
            
            exameItem.innerHTML = `
              <div class="exame-tipo">${exame.tipoExame}</div>
              <div class="exame-info">
                <span class="exame-medico">Dr(a). ${exame.medico} - ${exame.especialidade}</span>
                <span class="exame-data">${dataFormatada}</span>
              </div>
              ${exame.resultado ? `<div class="exame-resultado"><strong>Resultado:</strong> ${exame.resultado}</div>` : ''}
              ${exame.observacoes ? `<div class="exame-observacoes">${exame.observacoes}</div>` : ''}
            `;
            
            examesLista.appendChild(exameItem);
          });
        } catch (e) {
          console.error("Erro ao carregar histórico de exames:", e);
        }
      }

      async function registrarExame() {
        if (!pacienteAtual) return;
        
        const tipoExame = document.getElementById('tipoExame').value;
        const resultado = document.getElementById('resultadoExame').value;
        const observacoes = document.getElementById('observacoesExame').value;
        
        if (!tipoExame) {
          alert('Por favor, informe o tipo de exame.');
          return;
        }
        
        try {
          const medicoNome = document.getElementById('medicoNome').textContent;
          const especialidade = document.getElementById('medicoEspecialidade').textContent;
          
          const res = await fetch(`${API_URL.replace('/senhas', '')}/exames`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              senha: pacienteAtual.senha,
              medico: medicoNome,
              especialidade: especialidade,
              tipoExame: tipoExame,
              resultado: resultado,
              observacoes: observacoes
            })
          });
          
          if (res.ok) {
            // Limpa formulário
            document.getElementById('tipoExame').value = '';
            document.getElementById('resultadoExame').value = '';
            document.getElementById('observacoesExame').value = '';
            
            // Atualiza histórico
            await carregarHistoricoExames(pacienteAtual.senha);
          } else {
            throw new Error('Erro ao registrar exame');
          }
        } catch (e) {
          console.error("Erro ao registrar exame:", e);
          alert('Erro ao registrar exame. Tente novamente.');
        }
      }

      // Função para buscar médicos/usuários ativos
      async function carregarMedicosAtivos() {
        try {
          // Preferir Supabase (perfis) quando disponível
          if (window.safeSupabase) {
            const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
            const myId = loggedUser?.id || null;

            const { data: profiles, error } = await window.safeSupabase
              .from('profiles')
              .select('id,nome,role,specialty')
              .eq('role', 'medico')
              .order('nome', { ascending: true });
            if (error) throw error;

            const medicos = (Array.isArray(profiles) ? profiles : []).filter((p) => !myId || String(p.id) !== String(myId));

            const selectMedico = document.getElementById('medicoDestino');
            selectMedico.innerHTML = '<option value="">Selecione o médico</option>';
            selectMedico.disabled = false;

            if (medicos.length === 0) {
              selectMedico.innerHTML += '<option value="" disabled>Nenhum médico disponível</option>';
              return;
            }

            medicos.forEach((m, index) => {
              const option = document.createElement('option');
              option.value = m.id; // UUID (para RPC encaminhar_senha)
              option.textContent = `${m.nome}${m.specialty ? ' - ' + m.specialty : ''}`;
              option.dataset.sala = `Sala ${String(index + 1).padStart(2, '0')}`; // placeholder local
              selectMedico.appendChild(option);
            });
            return;
          }

          // Lista estática de médicos disponíveis (fallback quando API não estiver disponível)
          const medicosEstaticos = [
            { nome: 'Dr. João Silva', especialidade: 'Clínico Geral', sala: 'Sala 01', email: 'medico@safe.com' },
            { nome: 'Dra. Maria Santos', especialidade: 'Cardiologia', sala: 'Sala 02', email: 'medico2@safe.com' },
            { nome: 'Dr. Carlos Oliveira', especialidade: 'Ortopedia', sala: 'Sala 03', email: 'medico3@safe.com' },
            { nome: 'Dra. Ana Costa', especialidade: 'Pediatria', sala: 'Sala 04', email: 'medico4@safe.com' }
          ];
          
          let medicosAtivos = [];
          
          // Tentar buscar da API primeiro
          try {
            let usuariosURL = window.API_CONFIG?.USUARIOS_URL;
            
            if (!usuariosURL) {
              const isLocalhost = window.location.hostname === 'localhost' || 
                                 window.location.hostname === '127.0.0.1' ||
                                 !window.location.hostname ||
                                 window.location.hostname === '';
              const baseURL = isLocalhost 
                ? 'http://localhost:3000/api'
                : `${window.location.origin}/api`;
              usuariosURL = `${baseURL}/usuarios`;
            }
            
            const res = await fetch(usuariosURL);
            
            if (res.ok) {
              const usuarios = await res.json();
              
              // Filtrar apenas médicos ativos
              medicosAtivos = usuarios.filter(u => {
                const isMedico = !u.tipo || u.tipo === 'medico' || u.role === 'medico' || u.funcao === 'medico';
                const isAtivo = u.ativo !== false && u.status !== 'inativo';
                return isMedico && isAtivo;
              });
              
            } else {
              throw new Error(`HTTP error! status: ${res.status}`);
            }
          } catch (apiError) {
            console.warn('⚠️ Erro ao buscar médicos da API, usando lista estática:', apiError);
            // Usar lista estática se API falhar
            medicosAtivos = medicosEstaticos;
          }
          
          // Se não encontrou médicos na API, usar lista estática
          if (!medicosAtivos || medicosAtivos.length === 0) {
            medicosAtivos = medicosEstaticos;
          }

          // Descobrir médicos ocupados (com paciente em atendimento)
          let busyNames = new Set();
          let busyEmails = new Set();
          try {
            const urlSenhas = getAPIUrl();
            const resSenhas = await fetch(urlSenhas);
            if (resSenhas.ok) {
              const senhas = await resSenhas.json();
              (Array.isArray(senhas) ? senhas : []).forEach((s) => {
                if (!s) return;
                const status = s.status != null ? String(s.status).trim() : "";
                if (status !== "em_atendimento") return;
                if (s.medicoAtendendo) busyNames.add(String(s.medicoAtendendo).trim());
                if (s.medicoAtendendoEmail) busyEmails.add(String(s.medicoAtendendoEmail).trim());
                const nomeCompleto = s.nome || "";
                const match = String(nomeCompleto).match(/ \[EM ATENDIMENTO - (.+?)\]$/);
                if (match && match[1]) busyNames.add(String(match[1]).trim());
              });
            }
          } catch (e) {
            // Se falhar, não bloqueia o encaminhamento (só não filtra por disponibilidade)
          }

          function normalizeDoctorName(name) {
            return String(name || "")
              .replace(/\s+/g, " ")
              .trim()
              .replace(/^Dr\.\s*/i, "")
              .replace(/^Dra\.\s*/i, "")
              .toLowerCase();
          }
          const busyNamesNorm = new Set(Array.from(busyNames).map(normalizeDoctorName).filter(Boolean));
          
          // Excluir o médico atual da lista
          const medicoAtual = document.getElementById('medicoNome').textContent;
          const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          
          medicosAtivos = medicosAtivos.filter(medico => {
            const nomeMedico = medico.nome || medico.name || '';
            // Excluir o médico atual por nome ou email
            const naoEhAtual = nomeMedico !== medicoAtual && 
                              `Dr. ${nomeMedico}` !== medicoAtual && 
                              `Dra. ${nomeMedico}` !== medicoAtual &&
                              medico.email !== loggedUser.email;
            if (!naoEhAtual) return false;

            // Filtrar somente médicos disponíveis (sem atendimento em andamento)
            const email = medico.email ? String(medico.email).trim() : "";
            if (email && busyEmails.has(email)) return false;
            const nomeNorm = normalizeDoctorName(nomeMedico);
            if (nomeNorm && busyNamesNorm.has(nomeNorm)) return false;
            // Também comparar contra o "nome completo" que costuma ser salvo (Dr./Dra.)
            const nomeCompleto = `${nomeMedico}`.trim();
            if (nomeCompleto && busyNames.has(nomeCompleto)) return false;
            return true;
          });
          
          // Preencher select com médicos ativos
          const selectMedico = document.getElementById('medicoDestino');
          selectMedico.innerHTML = '<option value="">Selecione o médico</option>';
          selectMedico.disabled = false;
          
          if (medicosAtivos.length === 0) {
            selectMedico.innerHTML += '<option value="" disabled>Nenhum médico ativo disponível</option>';
          } else {
            medicosAtivos.forEach((medico, index) => {
              const option = document.createElement('option');
              const nomeCompleto = medico.nome || medico.name || '';
              option.value = nomeCompleto;
              const texto = `${nomeCompleto}${medico.especialidade ? ' - ' + medico.especialidade : ''}${medico.sala ? ' - ' + medico.sala : ''}`;
              option.textContent = texto;
              
              // Adicionar sala se disponível
              if (medico.sala) {
                option.dataset.sala = medico.sala;
              } else {
                // Se não tiver sala, usar um padrão baseado no índice
                option.dataset.sala = `Sala ${String(index + 1).padStart(2, '0')}`;
              }
              selectMedico.appendChild(option);
            });
          }
        } catch (error) {
          console.error('Erro ao carregar médicos ativos:', error);
          // Em caso de erro, usar lista estática como fallback
          const medicosEstaticos = [
            { nome: 'Dr. João Silva', especialidade: 'Clínico Geral', sala: 'Sala 01' },
            { nome: 'Dra. Maria Santos', especialidade: 'Cardiologia', sala: 'Sala 02' }
          ];
          
          const medicoAtual = document.getElementById('medicoNome').textContent;
          const medicosFiltrados = medicosEstaticos.filter(m => m.nome !== medicoAtual);
          
          const selectMedico = document.getElementById('medicoDestino');
          selectMedico.innerHTML = '<option value="">Selecione o médico</option>';
          selectMedico.disabled = false;
          
          medicosFiltrados.forEach((medico, index) => {
            const option = document.createElement('option');
            option.value = medico.nome;
            option.textContent = `${medico.nome} - ${medico.especialidade} - ${medico.sala}`;
            option.dataset.sala = medico.sala;
            selectMedico.appendChild(option);
          });
        }
      }

      async function mostrarEncaminhamento() {
        // Carregar médicos ativos antes de mostrar o modal
        await carregarMedicosAtivos();
        const modalEncaminhamento = document.getElementById('modalEncaminhamento');
        modalEncaminhamento.classList.remove("hidden");
        modalEncaminhamento.classList.add("flex");

        // Default: encaminhar para médico
        const tipoEl = document.getElementById('tipoEncaminhamento');
        if (tipoEl && !tipoEl.value) tipoEl.value = 'medico';
        atualizarTipoEncaminhamento();
      }

      function atualizarTipoEncaminhamento() {
        const tipo = document.getElementById('tipoEncaminhamento')?.value || 'medico';
        const groupMedico = document.getElementById('groupMedicoDestino');
        const groupExame = document.getElementById('groupSalaExameDestino');

        if (tipo === 'exame') {
          if (groupMedico) groupMedico.style.display = 'none';
          if (groupExame) groupExame.style.display = '';
        } else {
          if (groupMedico) groupMedico.style.display = '';
          if (groupExame) groupExame.style.display = 'none';
        }
      }

      function fecharEncaminhamento() {
        const modalEncaminhamento = document.getElementById('modalEncaminhamento');
        modalEncaminhamento.classList.add("hidden");
        modalEncaminhamento.classList.remove("flex");
        // Limpa campos
        const tipoEl = document.getElementById('tipoEncaminhamento');
        if (tipoEl) tipoEl.value = 'medico';
        document.getElementById('medicoDestino').value = '';
        const salaExameEl = document.getElementById('salaExameDestino');
        if (salaExameEl) salaExameEl.value = '';
        document.getElementById('motivoEncaminhamento').value = '';
      }

      async function confirmarEncaminhamento() {
        if (!pacienteAtual) return;

        const tipo = document.getElementById('tipoEncaminhamento')?.value || 'medico';
        const motivo = document.getElementById('motivoEncaminhamento').value;

        let medicoDestino = null;
        let salaDestino = null;

        if (tipo === 'exame') {
          salaDestino = document.getElementById('salaExameDestino')?.value || '';
          if (!salaDestino) {
            alert('Por favor, selecione a sala de exame.');
            return;
          }
        } else {
          const medicoDestinoSelect = document.getElementById('medicoDestino');
          medicoDestino = medicoDestinoSelect.value;
          salaDestino = medicoDestinoSelect.options[medicoDestinoSelect.selectedIndex]?.dataset?.sala || 'Sala não informada';
          if (!medicoDestino) {
            alert('Por favor, informe o médico de destino.');
            return;
          }
        }
        
        try {
          const medicoOrigem = document.getElementById('medicoNome').textContent;
          
          // Preparar dados do encaminhamento
          const encaminhamentoData = {
            tipo: tipo,
            medicoOrigem: medicoOrigem,
            medicoDestino: medicoDestino,
            salaDestino: salaDestino,
            motivo: motivo,
            data: new Date().toISOString(),
            aceito: tipo === 'medico' ? false : true // Exames não precisam de aceite
          };
          
          if (window.safeSupabase) {
            if (tipo === 'exame') {
              const { error } = await window.safeSupabase.rpc('encaminhar_para_exame', {
                p_senha: pacienteAtual.senha,
                p_sala_destino: salaDestino,
                p_motivo: motivo
              });
              if (error) throw error;
            } else {
              const medicoDestinoId = medicoDestino; // no modo Supabase, value deve ser uuid
              const { error } = await window.safeSupabase.rpc('encaminhar_senha', {
                p_senha: pacienteAtual.senha,
                p_medico_destino_id: medicoDestinoId,
                p_motivo: motivo,
                p_sala_destino: salaDestino
              });
              if (error) throw error;
            }
          } else {
            // Legacy: mantém comportamento existente (PATCH no backend)
            try {
              const url = getAPIUrl();
              await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  encaminhamento: encaminhamentoData,
                  status: 'pendente',
                  medicoAtendendo: null,
                  medicoAtendendoEmail: null
                }),
              });
            } catch (patchError) {
              console.warn('⚠️ Erro ao atualizar senha do paciente:', patchError);
            }
          }
          
          // Fecha modal
          fecharEncaminhamento();
          
          // Salvar dados completos do encaminhamento para passar para o painel
          const dadosCompletos = {
            senha: pacienteAtual.senha,
            nome: pacienteAtual.nome,
            cpf: pacienteAtual.cpf || '',
            ...encaminhamentoData
          };
          
          // Salvar no localStorage para passar para o painel
          localStorage.setItem('encaminhamento', JSON.stringify(dadosCompletos));
          
          if (!window.safeSupabase && pacienteAtual && pacienteAtual.senha) {
            const nomeOriginal = pacienteAtual.nomeOriginal || pacienteAtual.nome || 'Sem nome';
            const nomeSemMarcador = nomeOriginal.replace(/ \[EM ATENDIMENTO - .+?\]$/, '');
            try {
              const url = getAPIUrl();
              await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                  nome: nomeSemMarcador,
                  medicoAtendendo: null,
                  medicoAtendendoEmail: null
                }),
              });
            } catch (e) {
              console.warn('Erro ao remover marcador:', e);
            }
            const chaveMedicoAtendendo = `medicoAtendendo_${pacienteAtual.senha}`;
            localStorage.removeItem(chaveMedicoAtendendo);
          }
          
          // Limpa paciente atual para voltar ao painel
          pacienteAtual = null;
          estatisticas.inicioConsulta = null;
          
          // Atualiza interface - volta para o painel
          const pacienteAtualEl = document.getElementById('pacienteAtual');
          pacienteAtualEl.classList.add('hidden');
          pacienteAtualEl.classList.remove('block');
          document.getElementById('btnFinalizarConsulta').disabled = true;
          document.getElementById('btnEncaminharPaciente').disabled = true;
          document.getElementById('btnChamarProximo').disabled = false;
          
          // Oculta ações
          const acoesPaciente2 = document.getElementById('acoesPaciente');
          acoesPaciente2.classList.add("hidden");
          acoesPaciente2.classList.remove("block");
          
          // Não redireciona para painel público (encaminhamento é interno entre médicos).
          // Apenas atualiza a fila localmente.
          setTimeout(() => {
            carregarFila();
          }, 300);
          
        } catch (e) {
          console.error("Erro ao encaminhar paciente:", e);
          alert(`Erro ao encaminhar paciente: ${e.message}. Verifique o console para mais detalhes.`);
        }
      }

      // Expor para o HTML
      window.atualizarTipoEncaminhamento = atualizarTipoEncaminhamento;

      // Função para aceitar encaminhamento
      async function aceitarEncaminhamento(senha) {
        try {
          let paciente = null;
          if (window.safeSupabase) {
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,encaminhamento')
              .eq('senha', senha)
              .single();
            if (error) throw error;
            paciente = data;
          } else {
            const url = getAPIUrl();
            const res = await fetch(url);
            const senhas = await res.json();
            paciente = senhas.find(s => s.senha === senha);
          }
          
          if (!paciente || !paciente.encaminhamento) {
            alert('Paciente não encontrado ou não foi encaminhado.');
            return;
          }
          
          // Verificar se foi encaminhado para este médico
          const medicoAtualNome = document.getElementById('medicoNome').textContent.trim();
          if (window.safeSupabase) {
            const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
            const myId = loggedUser?.id || null;
            const destinoId = paciente.encaminhamento?.medicoDestinoId || paciente.encaminhamento?.medicoDestino || null;
            if (destinoId && myId && String(destinoId) !== String(myId)) {
              alert('Este paciente não foi encaminhado para você.');
              return;
            }
          } else {
            const medicoDestino = paciente.encaminhamento.medicoDestino;
            if (medicoDestino !== medicoAtualNome && !medicoDestino.includes(medicoAtualNome)) {
              alert('Este paciente não foi encaminhado para você.');
              return;
            }
          }
          
          // Confirmar aceitação
          const confirmacao = confirm(
            `Aceitar encaminhamento do paciente ${paciente.nome || senha}?\n\n` +
            `Encaminhado por: ${paciente.encaminhamento.medicoOrigem}\n` +
            `Motivo: ${paciente.encaminhamento.motivo || 'Não informado'}`
          );
          
          if (!confirmacao) return;
          
          if (window.safeSupabase) {
            const { error } = await window.safeSupabase.rpc('aceitar_encaminhamento', { p_senha: senha });
            if (error) throw error;
          } else {
            const url = getAPIUrl();
            const encaminhamentoAtualizado = {
              ...paciente.encaminhamento,
              aceito: true,
              dataAceitacao: new Date().toISOString()
            };
            await fetch(`${url}/${encodeURIComponent(senha)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                encaminhamento: encaminhamentoAtualizado
              }),
            });
          }
          
          // Encaminhamento aceito com sucesso
          
          // Recarregar fila
          carregarFila();
          
        } catch (e) {
          console.error("Erro ao aceitar encaminhamento:", e);
          alert('Erro ao aceitar encaminhamento. Tente novamente.');
        }
      }
      
      // Expor função globalmente
      window.aceitarEncaminhamento = aceitarEncaminhamento;

      // Atualização automática a cada 3 segundos
      setInterval(carregarFila, 3000);
      
      // Carrega dados iniciais
      carregarFila();
      
      // Verificar se há paciente vindo do atendente ao carregar a página
      setTimeout(verificarPacienteAtendente, 500);
