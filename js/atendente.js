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
        return isLocalhost 
          ? 'http://localhost:3000/api/senhas'
          : 'https://safeatendimento-production.up.railway.app/api/senhas';
      }
      
      const API_URL = getAPIUrl();
      console.log('🔧 API_URL configurada:', API_URL);
      
      let senhaParaCadastro = null;
      let senhaParaEditar = null;

      async function carregarSenhas() {
        try {
          console.log("Carregando senhas do endpoint:", API_URL);
          const res = await fetch(API_URL);
          console.log("Resposta do servidor:", res.status, res.statusText);
          const senhas = await res.json();
          console.log("Senhas recebidas:", senhas);
          const lista = document.getElementById("senhaLista");
          const semSenhas = document.getElementById("semSenhas");
          lista.innerHTML = "";
          
          if (senhas.length === 0) {
            semSenhas.classList.remove("hidden");
            semSenhas.classList.add("block");
            console.log("Nenhuma senha encontrada");
          } else {
            semSenhas.classList.add("hidden");
            semSenhas.classList.remove("block");
            console.log("Exibindo", senhas.length, "senhas");
            
            senhas.forEach((s) => {
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
                    <div class="senha-nome text-lg font-semibold text-gray-800 mb-1">${s.nome || "Sem agendamento"}</div>
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
                btnCadastro.onclick = () => abrirModalCadastro(s.senha);
                actionsDiv.appendChild(btnCadastro);
              }
              
              // Botão Atender só se status for pendente E nome preenchido
              if (s.status === "pendente" && s.nome && s.nome !== "Sem agendamento") {
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
      function abrirModalCadastro(senha) {
        senhaParaCadastro = senha;
        const modalBg = document.getElementById("modalBg");
        modalBg.classList.remove("hidden");
        modalBg.classList.add("flex");
        document.getElementById("inputNome").value = "";
        document.getElementById("inputCpf").value = "";
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
        // Atualiza senha no backend (PATCH para adicionar nome/cpf e mudar status para pendente)
        await fetch(
          `${API_URL}/${encodeURIComponent(senhaParaCadastro)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, cpf }),
          }
        );
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
        // Atualiza apenas o nome no backend
        await fetch(
          `${API_URL}/${encodeURIComponent(senhaParaEditar)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome }),
          }
        );
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
