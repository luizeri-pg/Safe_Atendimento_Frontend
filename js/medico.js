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

      function normalizeRole(role) {
        return String(role || '').trim().toLowerCase();
      }

      const SAFE_ALLOWED_ATENDIMENTO_ROLES = new Set(['medico', 'enfermagem', 'fono']);

      async function getAccessToken() {
        try {
          function parseJwtExp(token) {
            try {
              const parts = String(token || '').split('.');
              if (parts.length < 2) return null;
              const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              const json = JSON.parse(atob(payload));
              const exp = Number(json?.exp || 0);
              return exp ? exp * 1000 : null;
            } catch {
              return null;
            }
          }

          // 1) Preferir token salvo no localStorage (login via backend)
          try {
            const stored = String(localStorage.getItem('SAFE_ACCESS_TOKEN') || '').trim();
            if (stored) {
              const expMs = parseJwtExp(stored);
              // Se expirar em < 60s, renova antes de usar (evita redirect ao login no meio da ação)
              if (expMs && expMs - Date.now() < 60_000) {
                const refreshed = await refreshAccessToken();
                return refreshed || stored;
              }
              return stored;
            }
          } catch {}

          // 2) Fallback: sessão do supabase-js (quando disponível)
          const supa = window.safeSupabase;
          if (!supa) return null;
          const { data } = await supa.auth.getSession();
          const token = data?.session?.access_token || null;
          if (token) return token;

          // Tentativa extra: se a sessão estiver "muda" no Safari, tenta refresh antes de desistir.
          if (typeof supa.auth.refreshSession === 'function') {
            await supa.auth.refreshSession().catch(() => null);
            const { data: data2 } = await supa.auth.getSession().catch(() => ({ data: null }));
            return data2?.session?.access_token || null;
          }
          return null;
        } catch {
          return null;
        }
      }

      let __safeRefreshingToken = null;
      async function refreshAccessToken() {
        if (__safeRefreshingToken) return __safeRefreshingToken;
        __safeRefreshingToken = (async () => {
          const apiBase = window.API_CONFIG?.BASE_URL || null;
          if (!apiBase) return null;
          const refreshToken = (function () {
            try {
              return String(localStorage.getItem('SAFE_REFRESH_TOKEN') || '').trim() || null;
            } catch {
              return null;
            }
          })();
          if (!refreshToken) return null;

          const res = await fetch(`${apiBase}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken })
          }).catch(() => null);
          if (!res || !res.ok) return null;
          const json = await res.json().catch(() => null);
          const nextAccess = String(json?.access_token || '').trim();
          const nextRefresh = String(json?.refresh_token || '').trim();
          if (!nextAccess || !nextRefresh) return null;
          try {
            localStorage.setItem('SAFE_ACCESS_TOKEN', nextAccess);
            localStorage.setItem('SAFE_REFRESH_TOKEN', nextRefresh);
            const expiresIn = Number(json?.expires_in || 0) || 0;
            if (expiresIn > 0) localStorage.setItem('SAFE_EXPIRES_AT', String(Date.now() + expiresIn * 1000));
          } catch {}
          return nextAccess;
        })().finally(() => {
          __safeRefreshingToken = null;
        });
        return __safeRefreshingToken;
      }

      function showAuthBanner(message) {
        try {
          const id = 'safe-auth-banner';
          let el = document.getElementById(id);
          if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.style.position = 'fixed';
            el.style.left = '12px';
            el.style.right = '12px';
            el.style.bottom = '12px';
            el.style.zIndex = '99999';
            el.style.padding = '12px 14px';
            el.style.borderRadius = '12px';
            el.style.background = 'rgba(17, 24, 39, 0.92)'; // gray-900
            el.style.color = '#fff';
            el.style.fontSize = '14px';
            el.style.fontWeight = '600';
            el.style.backdropFilter = 'blur(10px)';
            el.style.boxShadow = '0 10px 25px rgba(0,0,0,0.25)';
            document.body.appendChild(el);
          }
          el.textContent = String(message || '');
          el.style.display = 'block';
        } catch {
          // ignora
        }
      }

      function hideAuthBanner() {
        try {
          const el = document.getElementById('safe-auth-banner');
          if (el) el.style.display = 'none';
        } catch {
          // ignora
        }
      }

      async function supaProxyFetch(pathWithQuery, init = {}) {
        const apiBase = window.API_CONFIG?.BASE_URL || null; // inclui /api
        if (!apiBase) throw new Error('API_BASE_URL_not_configured');
        const token = await getAccessToken();
        if (!token) throw new Error('no_access_token');
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        if (!headers.has('Accept')) headers.set('Accept', 'application/json');
        return fetch(`${apiBase}/supa${pathWithQuery}`, { ...init, headers });
      }

      async function resolveLoggedUser() {
        // 1) Preferência: dados persistidos no localStorage
        try {
          const stored = JSON.parse(localStorage.getItem('loggedUser') || 'null');
          const role = normalizeRole(stored?.role);
          if (role && SAFE_ALLOWED_ATENDIMENTO_ROLES.has(role)) {
            // Garante que salvamos sempre normalizado (evita falhas por capitalização/whitespace)
            const normalizedStored = { ...stored, role };
            localStorage.setItem('loggedUser', JSON.stringify(normalizedStored));
            return normalizedStored;
          }
        } catch {
          // segue
        }

        // 2) Backend-first: se existe token, buscar perfil no backend (com refresh se necessário)
        try {
          const apiBase = window.API_CONFIG?.BASE_URL || null;
          const token = await getAccessToken();
          if (apiBase && token) {
            const meRes = await fetch(`${apiBase}/auth/me`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
            });
            if (meRes.ok) {
              const me = await meRes.json().catch(() => null);
              const profile = me?.profile || null;
              if (profile?.role) {
                const normalized = {
                  id: profile.id,
                  username: profile.username,
                  nome: profile.nome,
                  role: normalizeRole(profile.role),
                };
                localStorage.setItem('loggedUser', JSON.stringify(normalized));
                return normalized;
              }
            } else if (meRes.status === 401) {
              // tenta renovar e repetir 1x
              const next = await refreshAccessToken();
              if (next) {
                const me2 = await fetch(`${apiBase}/auth/me`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${next}`, Accept: 'application/json' }
                });
                if (me2.ok) {
                  const data = await me2.json().catch(() => null);
                  const profile = data?.profile || null;
                  if (profile?.role) {
                    const normalized = {
                      id: profile.id,
                      username: profile.username,
                      nome: profile.nome,
                      role: normalizeRole(profile.role),
                    };
                    localStorage.setItem('loggedUser', JSON.stringify(normalized));
                    return normalized;
                  }
                }
              }
            }
          }
        } catch {}

        // 3) Recuperar pelo Supabase (auth) + profile via proxy (fallback legado)
        const supa = window.safeSupabase;
        if (!supa) return null;
        try {
          const { data: sessionData, error: sessionErr } = await supa.auth.getSession();
          if (sessionErr) throw sessionErr;
          const userId = sessionData?.session?.user?.id;
          if (!userId) return null;

          const profRes = await supaProxyFetch(
            `/profiles?select=id,username,nome,role&id=eq.${encodeURIComponent(userId)}&limit=1`
          );
          if (!profRes.ok) return null;
          const profArr = await profRes.json().catch(() => []);
          const profile = Array.isArray(profArr) ? profArr[0] : profArr;
          if (!profile?.role) return null;

          const normalized = {
            id: profile.id,
            username: profile.username,
            nome: profile.nome,
            role: normalizeRole(profile.role),
          };
          localStorage.setItem('loggedUser', JSON.stringify(normalized));
          return normalized;
        } catch (e) {
          console.warn('[Atendimento] Falha ao restaurar sessão do Supabase:', e);
          return null;
        }
      }

      function applyAtendimentoHeader(user) {
        const role = normalizeRole(user?.role);
        const base = String(user?.nome || user?.username || '').trim();

        let displayName = base;
        if (role === 'medico') {
          displayName = base ? (/^dr\.?\s/i.test(base) ? base : `Dr. ${base}`) : 'Dr. Médico';
        } else if (!displayName) {
          displayName = role === 'enfermagem' ? 'Enfermagem' : role === 'fono' ? 'Fonoaudiologia' : 'Atendimento';
        }

        const local =
          role === 'medico'
            ? 'Consultório'
            : role === 'enfermagem'
              ? 'Exames 1 e 2'
              : role === 'fono'
                ? 'Exames 3'
                : 'Atendimento';

        document.getElementById('medicoNome').textContent = displayName;
        document.getElementById('medicoEspecialidade').textContent = local;
      }

      // Guard de acesso: somente perfis de atendimento (consultório/exames)
      (async function enforceAtendimento() {
        // Evita redirecionar para login por falhas transitórias de rede/sessão.
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const user = await resolveLoggedUser();
          const role = normalizeRole(user?.role);
          if (role && SAFE_ALLOWED_ATENDIMENTO_ROLES.has(role)) {
            hideAuthBanner();
            applyAtendimentoHeader(user);
            return;
          }

          const token = await getAccessToken();
          if (token) {
            showAuthBanner('Reconectando sua sessão… (se persistir, atualize a página)');
            // backoff simples
            await new Promise((r) => setTimeout(r, 250 + attempt * 350));
            continue;
          }

          break;
        }

        // Sem token/sessão após tentativas: realmente não está autenticado.
        window.location.href = 'login.html';
      })();

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
          const myRole = normalizeRole(loggedUser?.role);

          function normalizeRoom(s) {
            return String(s || '').trim().toLowerCase();
          }
          function normalizeEncaminhamentoValue(raw) {
            // Em alguns schemas antigos, `encaminhamento` pode vir como texto (JSON string).
            if (raw == null) return null;
            if (typeof raw === 'object') return raw;
            if (typeof raw === 'string') {
              const txt = raw.trim();
              if (!txt) return null;
              try {
                const parsed = JSON.parse(txt);
                return parsed && typeof parsed === 'object' ? parsed : null;
              } catch {
                return null;
              }
            }
            return null;
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
            if (myRole === 'fono') {
              return sala.includes('exame 3') || sala.includes('exames 3');
            }
            return true;
          }

          // Fonte de dados: Supabase (preferencial) ou backend antigo (fallback)
          let senhas = [];
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            // Buscar profiles via proxy (evita CORS no browser)
            const profilesById = {};
            try {
              const profRes = await supaProxyFetch(`/profiles?select=id,nome`);
              if (profRes.ok) {
                const profList = await profRes.json().catch(() => []);
                (Array.isArray(profList) ? profList : []).forEach((p) => {
                  if (p?.id) profilesById[String(p.id)] = String(p.nome || '').trim() || String(p.id);
                });
              }
            } catch {}

            const resSenhas = await supaProxyFetch(
              `/senhas?select=senha,nome,cpf,status,created_at,updated_at,called_at,encaminhamento,medico_atendendo_id&status=in.(pendente,em_atendimento,atendida)&order=updated_at.desc&limit=200`
            );
            if (!resSenhas.ok) {
              const txt = await resSenhas.text().catch(() => '');
              throw new Error(`proxy_senhas_failed_${resSenhas.status}: ${txt.slice(0, 200)}`);
            }
            const data = await resSenhas.json().catch(() => []);

            senhas = (Array.isArray(data) ? data : []).map((s) => {
              const rawEnc = normalizeEncaminhamentoValue(s.encaminhamento);
              const origemId = rawEnc?.medicoOrigemId || null;
              const destinoId = rawEnc?.medicoDestinoId || null;
              const enc = rawEnc
                ? {
                    tipo: rawEnc.tipo || null,
                    medicoOrigem: rawEnc.medicoOrigem || (origemId ? (profilesById[String(origemId)] || origemId) : null),
                    medicoDestino: rawEnc.medicoDestino || (destinoId ? (profilesById[String(destinoId)] || destinoId) : null),
                    salaDestino: rawEnc.salaDestino || null,
                    motivo: rawEnc.motivo || null,
                    aceito: rawEnc.aceito === true,
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

            // Fono: trabalha APENAS com encaminhamentos de exame (por sala)
            // Enfermagem usa a MESMA fila do médico (não restringe a exames).
            if (myRole === 'fono') {
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
                  <button type="button" class="btn-aceitar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="aceitarEncaminhamento('${s.senha}')">
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
                  <button type="button" class="btn-chamar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="chamarPaciente('${s.senha}')">
                    Chamar
                  </button>
                `;
              } else {
                // Paciente normal
                botaoAcao = `
                  <button type="button" class="btn-chamar bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40" onclick="chamarPaciente('${s.senha}')">
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
          const myRole = normalizeRole(loggedUser?.role);

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
            if (myRole === 'fono') {
              return sala.includes('exame 3') || sala.includes('exames 3');
            }
            return true;
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
              if (myRole === 'fono') {
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

              // Fono (legacy): somente exames por sala
              // Enfermagem usa a MESMA fila do médico (não restringe a exames).
              if (myRole === 'fono') {
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
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            const resOne = await supaProxyFetch(
              `/senhas?select=senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id&senha=eq.${encodeURIComponent(
                senha
              )}&limit=1`
            );
            if (!resOne.ok) throw new Error('Falha ao buscar paciente via proxy');
            const arr = await resOne.json().catch(() => []);
            const data = Array.isArray(arr) ? arr[0] : arr;
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
            
            if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
              // Novo fluxo: backend-first
              const token = await getAccessToken();
              if (!token) throw new Error('Sem token de autenticação');
              const callRes = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/chamar`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                  Accept: 'application/json'
                },
                body: JSON.stringify({ senha })
              });
              if (!callRes.ok) {
                alert('Esta senha não está mais disponível (já foi chamada ou não pode ser chamada).');
                carregarFila();
                return;
              }
              const called = await callRes.json().catch(() => null);
              paciente.status = called?.status || 'em_atendimento';
              paciente.medico_atendendo_id = called?.medico_atendendo_id || null;
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
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            const token = await getAccessToken();
            if (!token) throw new Error('Sem token de autenticação');
            const resFinal = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/finalizar`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify({ senha: pacienteAtual.senha })
            });
            if (!resFinal.ok) throw new Error('Falha ao finalizar via backend');
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
          // Em produção: usar proxy do backend (evita CORS no Safari)
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            const loggedUser = JSON.parse(localStorage.getItem('loggedUser') || '{}');
            const myId = loggedUser?.id || null;

            const res = await supaProxyFetch(`/profiles?select=id,nome,role,specialty&role=eq.medico&order=nome.asc`);
            if (!res.ok) throw new Error(`Falha ao listar médicos via proxy (${res.status})`);
            const profiles = await res.json().catch(() => []);

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
        const salaSelect = document.getElementById('salaExameDestino');

        function setOptionEnabled(opt, enabled) {
          if (!opt) return;
          opt.disabled = !enabled;
          opt.hidden = !enabled;
        }

        function updateSalaOptions(nextTipo) {
          if (!salaSelect) return;
          const options = Array.from(salaSelect.options || []);
          const valSet = new Set(options.map((o) => o.value));

          // Sempre manter o placeholder habilitado
          options.forEach((o) => {
            if (!o || o.value === '') {
              setOptionEnabled(o, true);
              return;
            }
            setOptionEnabled(o, true);
          });

          if (nextTipo === 'enfermagem') {
            // Sala 1 e 2
            options.forEach((o) => {
              if (!o || o.value === '') return;
              const v = String(o.value).toLowerCase();
              const ok = v.includes('exame 1') || v.includes('exame 2');
              setOptionEnabled(o, ok);
            });
            if (salaSelect.value && !['Sala de exame 1', 'Sala de exame 2'].includes(salaSelect.value)) {
              salaSelect.value = '';
            }
          } else if (nextTipo === 'fono') {
            // Sala 3
            options.forEach((o) => {
              if (!o || o.value === '') return;
              const v = String(o.value).toLowerCase();
              const ok = v.includes('exame 3');
              setOptionEnabled(o, ok);
            });
            // Auto-selecionar sala 3 se existir
            if (valSet.has('Sala de exame 3')) {
              salaSelect.value = 'Sala de exame 3';
            } else if (salaSelect.value && !String(salaSelect.value).toLowerCase().includes('exame 3')) {
              salaSelect.value = '';
            }
          } else {
            // medico: não usa sala (mas deixa tudo habilitado para quando trocar depois)
            options.forEach((o) => {
              if (!o || o.value === '') return;
              setOptionEnabled(o, true);
            });
            if (salaSelect.value) salaSelect.value = '';
          }
        }

        if (tipo !== 'medico') {
          if (groupMedico) groupMedico.style.display = 'none';
          if (groupExame) groupExame.style.display = '';
          updateSalaOptions(tipo);
        } else {
          if (groupMedico) groupMedico.style.display = '';
          if (groupExame) groupExame.style.display = 'none';
          updateSalaOptions('medico');
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
        atualizarTipoEncaminhamento();
      }

      async function confirmarEncaminhamento() {
        if (!pacienteAtual) return;

        const tipo = document.getElementById('tipoEncaminhamento')?.value || 'medico';
        const motivo = document.getElementById('motivoEncaminhamento').value;

        let medicoDestino = null;
        let salaDestino = null;

        if (tipo !== 'medico') {
          salaDestino = document.getElementById('salaExameDestino')?.value || '';
          // Fono: se não selecionou, assume Exame 3
          if (!salaDestino && tipo === 'fono') salaDestino = 'Sala de exame 3';
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
            tipo: tipo === 'medico' ? 'medico' : 'exame',
            medicoOrigem: medicoOrigem,
            medicoDestino: medicoDestino,
            salaDestino: salaDestino,
            motivo: motivo,
            data: new Date().toISOString(),
            aceito: tipo === 'medico' ? false : true // Exames não precisam de aceite
          };
          
          if (window.API_CONFIG?.BASE_URL) {
            // Novo fluxo: backend processa encaminhamento e chama RPC no Supabase.
            const token = await getAccessToken();
            if (!token) throw new Error('Sem token de autenticação');

            const resp = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/encaminhar`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify({
                senha: pacienteAtual.senha,
                tipo: tipo === 'medico' ? 'medico' : 'exame',
                medicoDestinoId: tipo === 'medico' ? medicoDestino : null,
                salaDestino: salaDestino,
                motivo: motivo
              })
            });

            if (!resp.ok) {
              const txt = await resp.text().catch(() => '');
              throw new Error(`Falha ao encaminhar via backend (${resp.status}): ${txt.slice(0, 120)}`);
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
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            const resOne = await supaProxyFetch(
              `/senhas?select=senha,nome,cpf,status,encaminhamento&senha=eq.${encodeURIComponent(senha)}&limit=1`
            );
            if (!resOne.ok) throw new Error('Falha ao buscar paciente via proxy');
            const arr = await resOne.json().catch(() => []);
            paciente = Array.isArray(arr) ? arr[0] : arr;
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
          
          if (window.API_CONFIG?.BASE_URL && (await getAccessToken())) {
            const token = await getAccessToken();
            if (!token) throw new Error('Sem token de autenticação');
            const resAcc = await fetch(`${window.API_CONFIG.BASE_URL}/atendimento/aceitar`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json'
              },
              body: JSON.stringify({ senha })
            });
            if (!resAcc.ok) throw new Error('Falha ao aceitar encaminhamento via backend');
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

      // Realtime (Supabase): atualiza a fila entre múltiplos usuários.
      // Mantém polling como fallback (caso Realtime não esteja ativo/configurado).
      let __safeSenhasPollId = null;
      let __safeSenhasRealtimeChannel = null;
      let __safeSenhasRefreshTimer = null;

      function startSenhasPolling(ms) {
        try {
          if (__safeSenhasPollId) clearInterval(__safeSenhasPollId);
        } catch {}
        __safeSenhasPollId = setInterval(carregarFila, ms);
      }

      function scheduleFilaRefresh() {
        try {
          if (__safeSenhasRefreshTimer) clearTimeout(__safeSenhasRefreshTimer);
        } catch {}
        __safeSenhasRefreshTimer = setTimeout(() => {
          carregarFila();
        }, 250);
      }

      function setupRealtimeSenhas() {
        if (window.__SAFE_DISABLE_REALTIME) return false;
        const supa = window.safeSupabase;
        if (!supa || typeof supa.channel !== 'function') return false;
        if (window.__SAFE_REALTIME_SENHAS_MEDICO_BOUND) return true;
        window.__SAFE_REALTIME_SENHAS_MEDICO_BOUND = true;

        try {
          __safeSenhasRealtimeChannel = supa
            .channel('safe-senhas-medico')
            .on(
              'postgres_changes',
              { event: '*', schema: 'public', table: 'senhas' },
              () => scheduleFilaRefresh()
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
          console.warn('[Realtime] Falha ao assinar mudanças de senhas (medico):', e);
          return false;
        }
      }

      // Polling fallback:
      // Mantém 3s para garantir sincronização mesmo no Safari (sem WebSocket).
      setupRealtimeSenhas();
      startSenhasPolling(3000);
      
      // Carrega dados iniciais
      carregarFila();
      
      // Verificar se há paciente vindo do atendente ao carregar a página
      setTimeout(verificarPacienteAtendente, 500);
