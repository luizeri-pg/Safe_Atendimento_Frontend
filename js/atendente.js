      // Aguardar configuração estar disponível
      function getAPIUrl() {
        // Se config já está disponível, usar ela
        if (window.API_CONFIG && window.API_CONFIG.SENHAS_URL) {
          return window.API_CONFIG.SENHAS_URL;
        }
        // Fallback: detectar localhost manualmente
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
        // Em produção, por padrão usamos o mesmo domínio do frontend (front+back no mesmo serviço).
        return isLocalhost
          ? 'http://localhost:3000/api/senhas'
          : `${window.location.origin}/api/senhas`;
      }
      
      const API_URL = getAPIUrl();

      // Guard de acesso: atendente não pode acessar painel do médico e vice-versa
      (function enforceAtendente() {
        try {
          const logged = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          const role = String(logged?.role || '').trim().toLowerCase();
          // Permitir que Enfermagem use este painel também (triagem/fila).
          const allowed = new Set(['atendente', 'enfermagem']);
          if (!role || !allowed.has(role)) {
            // Evita acesso cruzado
            window.location.href = 'login.html';
          }
        } catch {
          window.location.href = 'login.html';
        }
      })();
      
      let senhaParaCadastro = null;
      let senhaParaEditar = null;

      async function carregarSenhas() {
        try {
          let senhas = [];
          // Sempre usar o backend como proxy em produção (evita CORS do Safari com supabase.co).
          if (window.API_CONFIG?.BASE_URL) {
            const token = (function () {
              try {
                return String(localStorage.getItem('SAFE_ACCESS_TOKEN') || '').trim() || null;
              } catch {
                return null;
              }
            })();
            if (!token) {
              window.location.href = 'login.html';
              return;
            }

            const res = await fetch(`${window.API_CONFIG.BASE_URL}/atendente/senhas`, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
            });
            if (!res.ok) throw new Error(`Falha ao buscar senhas (${res.status})`);
            const data = await res.json().catch(() => []);
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
            if (!res.ok) {
              throw new Error(`Erro ao buscar senhas: ${res.status}`);
            }
            senhas = await res.json();
            // Garantir que é um array
            if (!Array.isArray(senhas)) {
              console.warn('[Atendente] Resposta não é um array:', senhas);
              senhas = [];
            }
          }
          
          const lista = document.getElementById("senhaLista");
          const semSenhas = document.getElementById("semSenhas");
          lista.innerHTML = "";
          
          // Debug: log das senhas recebidas
          console.log(`[Atendente] Total de senhas recebidas: ${senhas.length}`);
          
          const visiveis = (Array.isArray(senhas) ? senhas : []).filter((s) => {
            const status = s?.status ? String(s.status).trim() : "";
            const nome = String(s?.nome || "");
            const temMarcadorAtendimento = / \[EM ATENDIMENTO - .+?\]$/.test(nome);
            const temMedicoAtendendo =
              s?.medicoAtendendo != null && String(s.medicoAtendendo).trim().length > 0;

            // No painel do atendente NÃO mostramos pacientes já "chamados"/em atendimento
            if (status === "em_atendimento") return false;
            if (temMarcadorAtendimento || temMedicoAtendendo) return false;

            // Mostramos somente: cadastros (sem nome ou com nome) e pendentes (fila)
            // IMPORTANTE: Mostrar cadastros mesmo sem nome para o atendente poder cadastrar
            return status === "cadastro" || status === "pendente";
          });
          
          // Debug: log das senhas visíveis
          console.log(`[Atendente] Senhas visíveis após filtro: ${visiveis.length}`);

          if (visiveis.length === 0) {
            semSenhas.classList.remove("hidden");
            semSenhas.classList.add("block");
          } else {
            semSenhas.classList.add("hidden");
            semSenhas.classList.remove("block");
            
            visiveis.forEach((s) => {
              const item = document.createElement("div");
              item.className = "senha-item bg-white rounded-2xl p-6 flex items-center justify-between shadow-md border border-black/5 transition-all duration-300 relative overflow-hidden hover:-translate-y-0.5 hover:shadow-xl md:flex-row flex-col gap-4 text-center md:text-left";
              
              // Status badge
              let statusBadge = "";
              if (s.status === "cadastro") {
                statusBadge = '<span class="status-badge inline-block py-1 px-3 rounded-full text-xs font-semibold uppercase tracking-wide ml-3 bg-blue-100 text-blue-700">Cadastro</span>';
              } else if (s.status === "pendente") {
                statusBadge = '<span class="status-badge inline-block py-1 px-3 rounded-full text-xs font-semibold uppercase tracking-wide ml-3 bg-yellow-100 text-yellow-700">Pendente</span>';
              } else if (s.status === "atendida") {
                statusBadge = '<span class="status-badge inline-block py-1 px-3 rounded-full text-xs font-semibold uppercase tracking-wide ml-3 bg-green-100 text-green-700">Atendida</span>';
              }
              
              item.innerHTML = `
                <div class="senha-info flex items-center gap-5 flex-1">
                  <div class="senha-numero text-3xl font-extrabold text-blue-500 min-w-[80px] text-center">${s.senha}</div>
                  <div class="senha-details flex-1">
                    <div class="senha-nome text-lg font-semibold text-gray-800 mb-1">${
                      s.nome
                        ? String(s.nome).replace(/ \[EM ATENDIMENTO - .+?\]$/, '')
                        : (s.cpf ? `Sem nome (CPF: ${s.cpf})` : "Sem nome")
                    }</div>
                    <div class="senha-status text-sm text-gray-500 font-medium">
                      ${statusBadge}
                      ${
                        s.status === "pendente"
                          ? '<div class="text-xs text-gray-400 mt-1">Aguardando chamada no atendimento</div>'
                          : ''
                      }
                    </div>
                  </div>
                </div>
                <div class="senha-actions flex gap-3 items-center w-full md:w-auto justify-center"></div>
              `;
              
              const actionsDiv = item.querySelector('.senha-actions');
              
              // Botão Editar Nome para todas as senhas
              const btnEditar = document.createElement("button");
              btnEditar.className = "btn-editar bg-gradient-to-br from-orange-500 to-orange-700 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-orange-500/30 whitespace-nowrap hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/40";
              btnEditar.innerHTML = '<i class="fas fa-edit"></i> Editar';
              btnEditar.onclick = () => abrirModalEditarNome(s.senha, s.nome);
              actionsDiv.appendChild(btnEditar);
              
              // Botão Cadastro só se status for cadastro
              if (s.status === "cadastro") {
                const btnCadastro = document.createElement("button");
                btnCadastro.className = "btn-cadastrar bg-gradient-to-br from-blue-500 to-blue-700 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-blue-500/30 whitespace-nowrap hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40";
                btnCadastro.innerHTML = '<i class="fas fa-user-plus"></i> Cadastrar';
                btnCadastro.onclick = () => abrirModalCadastro(s.senha, s.cpf);
                actionsDiv.appendChild(btnCadastro);
              }
              
              lista.appendChild(item);
            });
          }
        } catch (e) {
          console.error("Erro ao carregar senhas:", e);
          document.getElementById("semSenhas").innerHTML = `
            <i class="fas fa-exclamation-triangle text-5xl mb-4 text-gray-300"></i>
            <h3 class="text-2xl font-semibold mb-2 text-gray-700">Erro ao carregar dados</h3>
            <p class="text-base text-gray-500">Verifique sua conexão e tente novamente</p>
          `;
          const semSenhas = document.getElementById("semSenhas");
          semSenhas.classList.remove("hidden");
          semSenhas.classList.add("block");
        }
      }
      // Modal de cadastro
      function abrirModalCadastro(senha, cpfAtual) {
        senhaParaCadastro = senha;
        const modalBg = document.getElementById("modalBg");
        modalBg.classList.remove("hidden");
        modalBg.classList.add("flex");
        document.getElementById("inputNome").value = "";
        const inputCpf = document.getElementById("inputCpf");
        inputCpf.value = cpfAtual || "";
        // Se o CPF já veio do totém, não precisa digitar de novo
        inputCpf.readOnly = Boolean(cpfAtual);
        inputCpf.classList.toggle('opacity-60', Boolean(cpfAtual));
      }
      
      // Modal de editar nome
      function abrirModalEditarNome(senha, nomeAtual) {
        senhaParaEditar = senha;
        const modalBg = document.getElementById("modalEditarBg");
        modalBg.classList.remove("hidden");
        modalBg.classList.add("flex");
        document.getElementById("inputNomeEditar").value = nomeAtual || "";
      }
      document.getElementById("btnCancelar").onclick = function () {
        const modalBg = document.getElementById("modalBg");
        modalBg.classList.add("hidden");
        modalBg.classList.remove("flex");
        senhaParaCadastro = null;
      };
      
      document.getElementById("btnCancelarEditar").onclick = function () {
        const modalBg = document.getElementById("modalEditarBg");
        modalBg.classList.add("hidden");
        modalBg.classList.remove("flex");
        senhaParaEditar = null;
      };
      document.getElementById("modalCadastro").onsubmit = async function (e) {
        e.preventDefault();
        const nome = document.getElementById("inputNome").value.trim();
        const cpf = document.getElementById("inputCpf").value.trim();
        if (!nome || !cpf) return;
        if (window.API_CONFIG?.BASE_URL) {
          const token = (function () {
            try {
              return String(localStorage.getItem('SAFE_ACCESS_TOKEN') || '').trim() || null;
            } catch {
              return null;
            }
          })();
          if (!token) throw new Error('Sem token de autenticação');

          const res = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/triar`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              senha: senhaParaCadastro,
              nome,
              cpf,
              soc_status: 'nao_verificado'
            })
          });
          if (!res.ok) throw new Error(`Falha ao triar via backend (${res.status})`);
        } else {
          // Atualiza senha no backend (PATCH para adicionar nome/cpf e mudar status para pendente)
          await fetch(
            `${API_URL}/${encodeURIComponent(senhaParaCadastro)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nome, cpf }),
            }
          );
        }
        const modalBg = document.getElementById("modalBg");
        modalBg.classList.add("hidden");
        modalBg.classList.remove("flex");
        senhaParaCadastro = null;
        carregarSenhas();
      };
      
      document.getElementById("modalEditarNome").onsubmit = async function (e) {
        e.preventDefault();
        const nome = document.getElementById("inputNomeEditar").value.trim();
        if (!nome) return;
        if (window.API_CONFIG?.BASE_URL) {
          const token = (function () {
            try {
              return String(localStorage.getItem('SAFE_ACCESS_TOKEN') || '').trim() || null;
            } catch {
              return null;
            }
          })();
          if (!token) throw new Error('Sem token de autenticação');

          // Buscar cpf/soc_status via proxy (somente leitura)
          const getRes = await fetch(
            `${window.API_CONFIG.BASE_URL}/supa/senhas?select=cpf,soc_status&senha=eq.${encodeURIComponent(senhaParaEditar)}&limit=1`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
          );
          if (!getRes.ok) throw new Error('Falha ao buscar dados da senha via proxy');
          const arr = await getRes.json().catch(() => []);
          const row = Array.isArray(arr) ? arr[0] : arr;

          const res = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/triar`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              senha: senhaParaEditar,
              nome,
              cpf: row?.cpf || '',
              soc_status: row?.soc_status || 'nao_verificado'
            })
          });
          if (!res.ok) throw new Error(`Falha ao atualizar via backend (${res.status})`);
        } else {
          // Atualiza apenas o nome no backend
          await fetch(
            `${API_URL}/${encodeURIComponent(senhaParaEditar)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nome }),
            }
          );
        }
        const modalBg = document.getElementById("modalEditarBg");
        modalBg.classList.add("hidden");
        modalBg.classList.remove("flex");
        senhaParaEditar = null;
        carregarSenhas();
      };
      function logout() {
        if (confirm('Deseja realmente sair do sistema?')) {
          window.location.href = 'login.html';
        }
      }

      // Realtime (Supabase): atualiza a lista entre múltiplos usuários.
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
        if (window.__SAFE_DISABLE_REALTIME) return false;
        const supa = window.safeSupabase;
        if (!supa || typeof supa.channel !== 'function') return false;
        if (window.__SAFE_REALTIME_SENHAS_ATENDENTE_BOUND) return true;
        window.__SAFE_REALTIME_SENHAS_ATENDENTE_BOUND = true;

        try {
          __safeSenhasRealtimeChannel = supa
            .channel('safe-senhas-atendente')
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
          console.warn('[Realtime] Falha ao assinar mudanças de senhas (atendente):', e);
          return false;
        }
      }

      // Polling fallback:
      // Mantém 2s para garantir sincronização mesmo no Safari (sem WebSocket).
      setupRealtimeSenhas();
      startSenhasPolling(2000);
      
      // Carrega dados iniciais
      carregarSenhas();
