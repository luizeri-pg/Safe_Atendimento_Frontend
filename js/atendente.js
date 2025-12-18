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
            semSenhas.style.display = "block";
            console.log("Nenhuma senha encontrada");
          } else {
            semSenhas.style.display = "none";
            console.log("Exibindo", senhas.length, "senhas");
            
            senhas.forEach((s) => {
              const item = document.createElement("div");
              item.className = "senha-item";
              
              // Status badge
              let statusBadge = "";
              if (s.status === "cadastro") {
                statusBadge = '<span class="status-badge status-cadastro">Cadastro</span>';
              } else if (s.status === "pendente") {
                statusBadge = '<span class="status-badge status-pendente">Pendente</span>';
              } else if (s.status === "atendida") {
                statusBadge = '<span class="status-badge status-atendida">Atendida</span>';
              }
              
              item.innerHTML = `
                <div class="senha-info">
                  <div class="senha-numero">${s.senha}</div>
                  <div class="senha-details">
                    <div class="senha-nome">${s.nome || "Sem agendamento"}</div>
                    <div class="senha-status">${statusBadge}</div>
                  </div>
                </div>
                <div class="senha-actions"></div>
              `;
              
              const actionsDiv = item.querySelector('.senha-actions');
              
              // Botão Editar Nome para todas as senhas
              const btnEditar = document.createElement("button");
              btnEditar.className = "btn-editar";
              btnEditar.innerHTML = '<i class="fas fa-edit"></i> Editar';
              btnEditar.onclick = () => abrirModalEditarNome(s.senha, s.nome);
              actionsDiv.appendChild(btnEditar);
              
              // Botão Cadastro só se status for cadastro
              if (s.status === "cadastro") {
                const btnCadastro = document.createElement("button");
                btnCadastro.className = "btn-cadastrar";
                btnCadastro.innerHTML = '<i class="fas fa-user-plus"></i> Cadastrar';
                btnCadastro.onclick = () => abrirModalCadastro(s.senha);
                actionsDiv.appendChild(btnCadastro);
              }
              
              // Botão Atender só se status for pendente E nome preenchido
              if (s.status === "pendente" && s.nome && s.nome !== "Sem agendamento") {
                const btn = document.createElement("button");
                btn.className = "btn-atender";
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
            <i class="fas fa-exclamation-triangle"></i>
            <h3>Erro ao carregar dados</h3>
            <p>Verifique sua conexão e tente novamente</p>
          `;
          document.getElementById("semSenhas").style.display = "block";
        }
      }
      // Modal de cadastro
      function abrirModalCadastro(senha) {
        senhaParaCadastro = senha;
        document.getElementById("modalBg").style.display = "flex";
        document.getElementById("inputNome").value = "";
        document.getElementById("inputCpf").value = "";
      }
      
      // Modal de editar nome
      function abrirModalEditarNome(senha, nomeAtual) {
        senhaParaEditar = senha;
        document.getElementById("modalEditarBg").style.display = "flex";
        document.getElementById("inputNomeEditar").value = nomeAtual || "";
      }
      document.getElementById("btnCancelar").onclick = function () {
        document.getElementById("modalBg").style.display = "none";
        senhaParaCadastro = null;
      };
      
      document.getElementById("btnCancelarEditar").onclick = function () {
        document.getElementById("modalEditarBg").style.display = "none";
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
        document.getElementById("modalBg").style.display = "none";
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
        document.getElementById("modalEditarBg").style.display = "none";
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
