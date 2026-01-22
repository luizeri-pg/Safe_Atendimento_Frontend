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
          if (!logged?.role || logged.role !== 'atendente') {
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
          if (window.safeSupabase) {
            const { data, error } = await window.safeSupabase
              .from('senhas')
              .select('senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id')
              .in('status', ['cadastro', 'pendente'])
              .is('medico_atendendo_id', null)
              .order('updated_at', { ascending: false })
              .limit(200);
            if (error) {
              console.error('Erro ao buscar senhas do Supabase:', error);
              throw error;
            }
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
                    <div class="senha-status text-sm text-gray-500 font-medium">${statusBadge}</div>
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
              
              // Botão Atender só se status for pendente E nome preenchido
              // (e não estiver em atendimento)
              const nomeTemMarcador = / \[EM ATENDIMENTO - .+?\]$/.test(String(s.nome || ''));
              const temMedicoAtendendo =
                s?.medicoAtendendo != null && String(s.medicoAtendendo).trim().length > 0;
              if (s.status === "pendente" && s.nome && s.nome !== "Sem agendamento" && !nomeTemMarcador && !temMedicoAtendendo) {
                const btn = document.createElement("button");
                btn.className = "btn-atender bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 whitespace-nowrap hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40";
                btn.innerHTML = '<i class="fas fa-check"></i> Atender';
                btn.onclick = async () => {
                  btn.disabled = true;
                  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
                  
                  // Salvar dados do paciente para passar para o médico
                  const pacienteData = {
                    senha: s.senha,
                    nome: s.nome,
                    cpf: s.cpf || '',
                    status: s.status,
                    data: s.data || new Date().toISOString()
                  };
                  
                  // Salvar no localStorage para passar para a página do médico
                  localStorage.setItem('pacienteAtendimento', JSON.stringify(pacienteData));
                  
                  // Redirecionar para a página do médico
                  window.location.href = `medico.html?senha=${encodeURIComponent(s.senha)}`;
                };
                actionsDiv.appendChild(btn);
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
        if (window.safeSupabase) {
          const { error } = await window.safeSupabase.rpc('triar_senha', {
            p_senha: senhaParaCadastro,
            p_nome: nome,
            p_cpf: cpf,
            p_soc_status: 'nao_verificado'
          });
          if (error) throw error;
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
        if (window.safeSupabase) {
          // Reaproveita a RPC de triagem para atualizar nome mantendo CPF atual
          const { data: row, error: rowErr } = await window.safeSupabase
            .from('senhas')
            .select('cpf,soc_status')
            .eq('senha', senhaParaEditar)
            .single();
          if (rowErr) throw rowErr;

          const { error } = await window.safeSupabase.rpc('triar_senha', {
            p_senha: senhaParaEditar,
            p_nome: nome,
            p_cpf: row?.cpf || '',
            p_soc_status: row?.soc_status || 'nao_verificado'
          });
          if (error) throw error;
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

      // Atualização automática a cada 2 segundos
      setInterval(carregarSenhas, 2000);
      
      // Carrega dados iniciais
      carregarSenhas();
