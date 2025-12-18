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
            semSenhas.classList.remove("hidden");
            semSenhas.classList.add("block");
          } else {
            semSenhas.classList.add("hidden");
            semSenhas.classList.remove("block");
            
            // Ordena por data (mais recentes primeiro)
            senhas.sort((a, b) => new Date(b.data) - new Date(a.data));
            
            let html = `
              <table class="w-full border-collapse">
                <thead>
                  <tr>
                    <th class="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide"><i class="fas fa-ticket-alt"></i> Senha</th>
                    <th class="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide"><i class="fas fa-user"></i> Nome</th>
                    <th class="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide"><i class="fas fa-info-circle"></i> Status</th>
                    <th class="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide"><i class="fas fa-clock"></i> Horário</th>
                  </tr>
                </thead>
                <tbody>
            `;
            
            senhas.forEach((s) => {
              const statusClass = s.status;
              const statusText = s.status.charAt(0).toUpperCase() + s.status.slice(1);
              
              let statusBadgeClass = "inline-block py-1.5 px-3 rounded-full text-xs font-semibold uppercase tracking-wide";
              if (statusClass === 'pendente') {
                statusBadgeClass += " bg-yellow-100 text-yellow-700";
              } else if (statusClass === 'atendida') {
                statusBadgeClass += " bg-green-100 text-green-700";
              } else if (statusClass === 'cadastro') {
                statusBadgeClass += " bg-blue-100 text-blue-700";
              }
              
              html += `
                <tr class="hover:bg-gray-50 transition-colors">
                  <td class="py-5 px-4 border-b border-gray-100 text-lg font-bold text-blue-500">${s.senha}</td>
                  <td class="py-5 px-4 border-b border-gray-100 text-base font-medium text-gray-800">${s.nome || 'Sem nome'}</td>
                  <td class="py-5 px-4 border-b border-gray-100"><span class="${statusBadgeClass}">${statusText}</span></td>
                  <td class="py-5 px-4 border-b border-gray-100 text-gray-500 font-medium">${formatarData(s.data)}</td>
                </tr>
              `;
            });
            
            html += `</tbody></table>`;
            tabelaContainer.innerHTML = html;
          }
        } catch (e) {
          console.error("Erro ao carregar histórico:", e);
          const semSenhas = document.getElementById("semSenhas");
          semSenhas.innerHTML = `
            <i class="fas fa-exclamation-triangle text-5xl mb-4 text-gray-300"></i>
            <h3 class="text-2xl font-semibold mb-2 text-gray-700">Erro ao carregar dados</h3>
            <p class="text-base text-gray-500">Verifique sua conexão e tente novamente</p>
          `;
          semSenhas.classList.remove("hidden");
          semSenhas.classList.add("block");
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
