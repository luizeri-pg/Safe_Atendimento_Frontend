      // Aguardar configuração estar disponível
      function getAPIUrl() {
        // Se config já está disponível, usar ela
        if (window.API_CONFIG && window.API_CONFIG.SENHAS_URL) {
          return `${window.API_CONFIG.SENHAS_URL}/historico`;
        }
        // Fallback: detectar localhost manualmente
        const isLocalhost = window.location.hostname === 'localhost' || 
                           window.location.hostname === '127.0.0.1' ||
                           window.location.hostname === '';
        return isLocalhost 
          ? 'http://localhost:3000/api/senhas/historico'
          : 'https://safeatendimento-production.up.railway.app/api/senhas/historico';
      }
      
      const API_URL = getAPIUrl();
      console.log('🔧 API_URL configurada:', API_URL);
      
      function formatarData(dataStr) {
        const d = new Date(dataStr);
        return d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });
      }

      function atualizarEstatisticas(senhas) {
        const total = senhas.length;
        const atendidas = senhas.filter(s => s.status === 'atendida').length;
        const pendentes = senhas.filter(s => s.status === 'pendente').length;
        const cadastros = senhas.filter(s => s.status === 'cadastro').length;

        document.getElementById('totalSenhas').textContent = total;
        document.getElementById('atendidas').textContent = atendidas;
        document.getElementById('pendentes').textContent = pendentes;
        document.getElementById('cadastros').textContent = cadastros;
      }

      async function carregarHistorico() {
        try {
          const res = await fetch(API_URL);
          const senhas = await res.json();
          const tabelaContainer = document.getElementById("tabelaContainer");
          const semSenhas = document.getElementById("semSenhas");
          
          // Atualiza estatísticas
          atualizarEstatisticas(senhas);
          
          if (senhas.length === 0) {
            tabelaContainer.innerHTML = "";
            semSenhas.style.display = "block";
          } else {
            semSenhas.style.display = "none";
            
            // Ordena por data (mais recentes primeiro)
            senhas.sort((a, b) => new Date(b.data) - new Date(a.data));
            
            let html = `
              <table>
                <thead>
                  <tr>
                    <th><i class="fas fa-ticket-alt"></i> Senha</th>
                    <th><i class="fas fa-user"></i> Nome</th>
                    <th><i class="fas fa-info-circle"></i> Status</th>
                    <th><i class="fas fa-clock"></i> Horário</th>
                  </tr>
                </thead>
                <tbody>
            `;
            
            senhas.forEach((s) => {
              const statusClass = s.status;
              const statusText = s.status.charAt(0).toUpperCase() + s.status.slice(1);
              
              html += `
                <tr>
                  <td class="senha-cell">${s.senha}</td>
                  <td class="nome-cell">${s.nome || 'Sem nome'}</td>
                  <td><span class="status-badge status-${statusClass}">${statusText}</span></td>
                  <td class="horario-cell">${formatarData(s.data)}</td>
                </tr>
              `;
            });
            
            html += `</tbody></table>`;
            tabelaContainer.innerHTML = html;
          }
        } catch (e) {
          console.error("Erro ao carregar histórico:", e);
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

      // Atualização automática a cada 5 segundos
      setInterval(carregarHistorico, 5000);
      
      // Carrega dados iniciais
      carregarHistorico();
