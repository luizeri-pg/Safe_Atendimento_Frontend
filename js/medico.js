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
          : 'https://safeatendimento-production.up.railway.app/api/senhas';
        
        return url;
      }
      
      const API_URL = getAPIUrl();
      let pacienteAtual = null;
      let estatisticas = {
        totalAtendidos: 0,
        tempoMedio: 0,
        inicioConsulta: null
      };

      // Configuração do médico baseada no login
      const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
      const medicoConfig = {
        'medico@safe.com': { nome: 'Dr. João Silva', especialidade: 'Clínico Geral' },
        'medico2@safe.com': { nome: 'Dra. Maria Santos', especialidade: 'Cardiologia' }
      };
      
      const medico = medicoConfig[loggedUser.email] || medicoConfig['medico@safe.com'];
      document.getElementById('medicoNome').textContent = medico.nome;
      document.getElementById('medicoEspecialidade').textContent = medico.especialidade;

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
          // Usar função getAPIUrl para garantir URL correta a cada chamada
          const url = getAPIUrl();
          const res = await fetch(url);
          const senhas = await res.json();
          
          // Obter médico atual logado
          const medicoAtualNome = document.getElementById('medicoNome').textContent.trim();
          const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          
          // Filtra senhas pendentes E que foram encaminhadas para este médico OU não foram encaminhadas
          const filaPendentes = senhas.filter(s => {
            if (s.status !== 'pendente') {
              return false;
            }
            
            // Verificar se o paciente está sendo atendido
            // Estratégia: verificar no nome se tem marcador [EM ATENDIMENTO - Nome do Médico]
            let medicoAtendendo = s.medicoAtendendo;
            let medicoAtendendoEmail = s.medicoAtendendoEmail;
            
            // Verificar se o nome tem marcador de atendimento
            const nomeCompleto = s.nome || '';
            const marcadorRegex = / \[EM ATENDIMENTO - (.+?)\]$/;
            const matchMarcador = nomeCompleto.match(marcadorRegex);
            
            if (matchMarcador) {
              const medicoDoMarcador = matchMarcador[1];
              
              // Se não tem no backend, usar do marcador no nome
              if (!medicoAtendendo || medicoAtendendo.trim() === '') {
                medicoAtendendo = medicoDoMarcador;
              }
            }
            
            // Também verificar no localStorage (para compatibilidade e controle local)
            const chaveMedicoAtendendo = `medicoAtendendo_${s.senha}`;
            const dadosLocalStorage = localStorage.getItem(chaveMedicoAtendendo);
            
            if (dadosLocalStorage && (!medicoAtendendo || medicoAtendendo.trim() === '')) {
              try {
                const dados = JSON.parse(dadosLocalStorage);
                const agora = new Date();
                const timestampAtendimento = new Date(dados.timestamp);
                const diferencaMinutos = (agora - timestampAtendimento) / 60000;
                
                // Se foi atualizado nos últimos 30 minutos, usar
                if (diferencaMinutos < 30) {
                  medicoAtendendo = dados.medico;
                  medicoAtendendoEmail = dados.email;
                }
              } catch (e) {
                console.warn('❌ Erro ao ler localStorage:', e);
              }
            }
            
            // Se o paciente está sendo atendido por outro médico, NÃO mostrar
            if (medicoAtendendo && medicoAtendendo.trim() !== '') {
              const medicoAtendendoTrim = medicoAtendendo.trim();
              const mesmoMedicoPorNome = medicoAtendendoTrim === medicoAtualNome;
              
              // Verificar também por email se disponível
              let mesmoMedicoPorEmail = false;
              if (loggedUser.email && medicoAtendendoEmail) {
                mesmoMedicoPorEmail = medicoAtendendoEmail.trim() === loggedUser.email.trim();
              }
              
              // Se NÃO é o médico atual (nem por nome nem por email), NÃO mostrar
              if (!mesmoMedicoPorNome && !mesmoMedicoPorEmail) {
                return false; // Está sendo atendido por outro médico
              }
              
              // Se é o médico atual, não mostrar na fila (já está no card de atendimento)
              return false;
            }
            
            // Se tem encaminhamento, verificar se foi encaminhado para este médico
            if (s.encaminhamento && s.encaminhamento.medicoDestino) {
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
          const url = getAPIUrl();
          const res = await fetch(url);
          const senhas = await res.json();
          
          // Obter médico atual
          const medicoAtualNome = document.getElementById('medicoNome').textContent;
          const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
          
          // Buscar próximo paciente disponível (não está sendo atendido por outro médico)
          const proximo = senhas.find(s => {
            if (s.status !== 'pendente') return false;
            
            // Se está sendo atendido por outro médico, não está disponível
            if (s.medicoAtendendo && s.medicoAtendendo !== medicoAtualNome) {
              if (loggedUser.email && s.medicoAtendendoEmail && s.medicoAtendendoEmail !== loggedUser.email) {
                return false;
              }
              if (!loggedUser.email || !s.medicoAtendendoEmail) {
                return false;
              }
            }
            
            // Se tem encaminhamento, só pode chamar se foi encaminhado para este médico
            if (s.encaminhamento && s.encaminhamento.medicoDestino) {
              const medicoDestino = s.encaminhamento.medicoDestino;
              return medicoDestino === medicoAtualNome || 
                     medicoDestino.includes(medicoAtualNome) ||
                     (loggedUser.email && medicoDestino.includes(loggedUser.email));
            }
            
            // Paciente disponível
            return true;
          });
          
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
              const url = getAPIUrl();
          const res = await fetch(url);
          const senhas = await res.json();
          const paciente = senhas.find(s => s.senha === senha);
          
          if (paciente) {
            // Obter informações do médico atual primeiro
            const medicoAtualNome = document.getElementById('medicoNome').textContent;
            const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
            
            // Verificar se o paciente já está sendo atendido por outro médico
            if (paciente.medicoAtendendo && paciente.medicoAtendendo !== medicoAtualNome) {
              // Verificar também por email
              if (loggedUser.email && paciente.medicoAtendendoEmail && paciente.medicoAtendendoEmail !== loggedUser.email) {
                alert(`Este paciente já está sendo atendido por ${paciente.medicoAtendendo}`);
                carregarFila(); // Atualiza a fila para remover este paciente
                return;
              }
              // Se não tem email, comparar por nome
              if (!loggedUser.email || !paciente.medicoAtendendoEmail) {
                alert(`Este paciente já está sendo atendido por ${paciente.medicoAtendendo}`);
                carregarFila(); // Atualiza a fila para remover este paciente
                return;
              }
            }
            
            // Salvar no backend que este médico está atendendo o paciente
            // Como o backend não retorna o campo medicoAtendendo, vamos usar uma estratégia:
            // Adicionar um marcador no nome do paciente temporariamente para indicar que está em atendimento
            // Isso será visível para outros médicos quando buscarem a lista
            try {
              const timestampAtual = new Date().toISOString();
              const nomeOriginal = paciente.nome || 'Sem nome';
              
              // Verificar se o nome já tem o marcador de outro médico
              const marcadorRegex = / \[EM ATENDIMENTO - .+?\]$/;
              const nomeSemMarcador = nomeOriginal.replace(marcadorRegex, '');
              
              // Adicionar marcador ao nome para indicar que está em atendimento
              const nomeComMarcador = `${nomeSemMarcador} [EM ATENDIMENTO - ${medicoAtualNome}]`;
              
              // Tentar salvar o campo medicoAtendendo E atualizar o nome com marcador
              const dadosParaSalvar = { 
                medicoAtendendo: medicoAtualNome,
                medicoAtendendoEmail: loggedUser.email || null,
                nome: nomeComMarcador, // Nome com marcador para outros médicos verem
                data: timestampAtual
              };
              
              const response = await fetch(`${url}/${encodeURIComponent(senha)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dadosParaSalvar),
              });
              
              if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Erro na resposta do backend:', response.status, errorText);
                throw new Error(`Erro ao salvar no backend: ${response.status}`);
              }
              
              const dadosSalvos = await response.json();
              
              // Salvar no localStorage com timestamp para controle local
              const chaveMedicoAtendendo = `medicoAtendendo_${senha}`;
              const dadosLocalStorage = {
                medico: medicoAtualNome,
                email: loggedUser.email || null,
                timestamp: timestampAtual,
                senha: senha
              };
              localStorage.setItem(chaveMedicoAtendendo, JSON.stringify(dadosLocalStorage));
              
              // Também salvar em um registro global de pacientes em atendimento
              const chaveGlobal = 'pacientesEmAtendimento';
              let pacientesGlobal = {};
              try {
                const dadosGlobal = localStorage.getItem(chaveGlobal);
                if (dadosGlobal) {
                  pacientesGlobal = JSON.parse(dadosGlobal);
                }
              } catch (e) {
                console.warn('Erro ao ler pacientes global:', e);
              }
              
              pacientesGlobal[senha] = dadosLocalStorage;
              localStorage.setItem(chaveGlobal, JSON.stringify(pacientesGlobal));
              
              // Atualizar dados locais (usar nome original para exibição local)
              paciente.medicoAtendendo = medicoAtualNome;
              paciente.medicoAtendendoEmail = loggedUser.email || null;
              paciente.data = timestampAtual;
              paciente.nomeOriginal = nomeSemMarcador; // Guardar nome original
              // Para exibição local, usar nome sem marcador
              paciente.nome = nomeSemMarcador;
            } catch (e) {
              console.error("❌ Erro ao salvar médico atendendo no backend:", e);
              alert('Erro ao salvar no servidor. Tente novamente.');
              return;
            }
            
            // Atualizar dados locais apenas após salvar no backend
            pacienteAtual = paciente;
            pacienteAtual.medicoAtendendo = medicoAtualNome;
            pacienteAtual.medicoAtendendoEmail = loggedUser.email || null;
            estatisticas.inicioConsulta = new Date();
            
            // Atualiza interface
            document.getElementById('senhaAtual').textContent = paciente.senha;
            document.getElementById('nomeAtual').textContent = paciente.nome || 'Sem nome';
            document.getElementById('cpfAtual').textContent = paciente.cpf || 'Sem CPF';
            document.getElementById('pacienteAtual').classList.add('ativo');
            
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
          const url = getAPIUrl();
          // Marca como atendida e remove médico atendendo
          await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              status: "atendida",
              medicoAtendendo: null,
              medicoAtendendoEmail: null
            }),
          });
          
          // Calcula tempo de consulta
          if (estatisticas.inicioConsulta) {
            const tempoConsulta = Math.floor((new Date() - estatisticas.inicioConsulta) / 60000);
            // Tempo de consulta calculado (pode ser usado para estatísticas futuras)
          }
          
          // Remover marcador do nome no backend e limpar localStorage
          if (pacienteAtual && pacienteAtual.senha) {
            const nomeOriginal = pacienteAtual.nomeOriginal || pacienteAtual.nome || 'Sem nome';
            // Remover marcador se houver
            const nomeSemMarcador = nomeOriginal.replace(/ \[EM ATENDIMENTO - .+?\]$/, '');
            
            // Atualizar no backend removendo o marcador
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
          document.getElementById('pacienteAtual').classList.remove('ativo');
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
                : 'https://safeatendimento-production.up.railway.app/api';
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
            return naoEhAtual;
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
      }

      function fecharEncaminhamento() {
        const modalEncaminhamento = document.getElementById('modalEncaminhamento');
        modalEncaminhamento.classList.add("hidden");
        modalEncaminhamento.classList.remove("flex");
        // Limpa campos
        document.getElementById('medicoDestino').value = '';
        document.getElementById('motivoEncaminhamento').value = '';
      }

      async function confirmarEncaminhamento() {
        if (!pacienteAtual) return;
        
        const medicoDestinoSelect = document.getElementById('medicoDestino');
        const medicoDestino = medicoDestinoSelect.value;
        const salaDestino = medicoDestinoSelect.options[medicoDestinoSelect.selectedIndex]?.dataset?.sala || 'Sala não informada';
        const motivo = document.getElementById('motivoEncaminhamento').value;
        
        if (!medicoDestino) {
          alert('Por favor, informe o médico de destino.');
          return;
        }
        
        try {
          const medicoOrigem = document.getElementById('medicoNome').textContent;
          
          // Preparar dados do encaminhamento
          const encaminhamentoData = {
            medicoOrigem: medicoOrigem,
            medicoDestino: medicoDestino,
            salaDestino: salaDestino,
            motivo: motivo,
            data: new Date().toISOString(),
            aceito: false // Inicialmente não aceito, precisa ser aceito pelo médico de destino
          };
          
          // Tentar salvar no backend via endpoint de encaminhamento (se existir)
          let encaminhamentoSalvo = false;
          try {
            const isLocalhost = window.location.hostname === 'localhost' || 
                               window.location.hostname === '127.0.0.1' ||
                               window.location.hostname === '';
            const baseURL = (window.API_CONFIG && window.API_CONFIG.BASE_URL) 
              ? window.API_CONFIG.BASE_URL
              : (isLocalhost ? "http://localhost:3000/api" : "https://safeatendimento-production.up.railway.app/api");
            
            const res = await fetch(`${baseURL}/encaminhamento`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                senha: pacienteAtual.senha,
                ...encaminhamentoData
              })
            });
            
            if (res.ok) {
              encaminhamentoSalvo = true;
            }
          } catch (apiError) {
            console.warn('⚠️ Endpoint de encaminhamento não disponível, salvando apenas localmente:', apiError);
          }
          
          // Tentar atualizar a senha do paciente para incluir dados de encaminhamento
          try {
            const url = getAPIUrl();
            const res = await fetch(`${url}/${encodeURIComponent(pacienteAtual.senha)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                encaminhamento: encaminhamentoData,
                status: 'pendente', // Mantém como pendente para o próximo médico
                medicoAtendendo: null, // Remove médico atendendo para que apareça para o médico de destino
                medicoAtendendoEmail: null
              }),
            });
            
            if (res.ok) {
              // Dados de encaminhamento adicionados com sucesso
            }
          } catch (patchError) {
            console.warn('⚠️ Erro ao atualizar senha do paciente:', patchError);
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
          
          // Remover marcador do nome no backend e limpar localStorage
          if (pacienteAtual && pacienteAtual.senha) {
            const nomeOriginal = pacienteAtual.nomeOriginal || pacienteAtual.nome || 'Sem nome';
            // Remover marcador se houver
            const nomeSemMarcador = nomeOriginal.replace(/ \[EM ATENDIMENTO - .+?\]$/, '');
            
            // Atualizar no backend removendo o marcador
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
          document.getElementById('pacienteAtual').classList.remove('ativo');
          document.getElementById('btnFinalizarConsulta').disabled = true;
          document.getElementById('btnEncaminharPaciente').disabled = true;
          document.getElementById('btnChamarProximo').disabled = false;
          
          // Oculta ações
          const acoesPaciente2 = document.getElementById('acoesPaciente');
          acoesPaciente2.classList.add("hidden");
          acoesPaciente2.classList.remove("block");
          
          // Redirecionar para o painel público mostrando o encaminhamento
          setTimeout(() => {
            window.location.href = `painel.html?encaminhamento=true&sala=${encodeURIComponent(salaDestino)}`;
          }, 1500);
          
        } catch (e) {
          console.error("Erro ao encaminhar paciente:", e);
          alert(`Erro ao encaminhar paciente: ${e.message}. Verifique o console para mais detalhes.`);
        }
      }

      // Função para aceitar encaminhamento
      async function aceitarEncaminhamento(senha) {
        try {
          const url = getAPIUrl();
          const res = await fetch(url);
          const senhas = await res.json();
          const paciente = senhas.find(s => s.senha === senha);
          
          if (!paciente || !paciente.encaminhamento) {
            alert('Paciente não encontrado ou não foi encaminhado.');
            return;
          }
          
          // Verificar se foi encaminhado para este médico
          const medicoAtualNome = document.getElementById('medicoNome').textContent.trim();
          const medicoDestino = paciente.encaminhamento.medicoDestino;
          
          if (medicoDestino !== medicoAtualNome && !medicoDestino.includes(medicoAtualNome)) {
            alert('Este paciente não foi encaminhado para você.');
            return;
          }
          
          // Confirmar aceitação
          const confirmacao = confirm(
            `Aceitar encaminhamento do paciente ${paciente.nome || senha}?\n\n` +
            `Encaminhado por: ${paciente.encaminhamento.medicoOrigem}\n` +
            `Motivo: ${paciente.encaminhamento.motivo || 'Não informado'}`
          );
          
          if (!confirmacao) return;
          
          // Atualizar encaminhamento para aceito
          const encaminhamentoAtualizado = {
            ...paciente.encaminhamento,
            aceito: true,
            dataAceitacao: new Date().toISOString()
          };
          
          // Atualizar no backend
          await fetch(`${url}/${encodeURIComponent(senha)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              encaminhamento: encaminhamentoAtualizado
            }),
          });
          
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
