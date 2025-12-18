// Variáveis de estado
let step = 0;
let nome = "";
let senha = "";
let paciente = null;
let consulta = null;
let consultasSOC = [];
let filaSemAgendamento = [];

// URLs da API - carregadas do config.js
const API_BASE_URL = window.API_CONFIG?.BASE_URL || "http://localhost:3000/api";

// Função para obter URL do SOC com data
function getSOCUrl(data) {
    if (window.API_CONFIG?.getSOC_URL) {
        return window.API_CONFIG.getSOC_URL(data);
    }
    // Fallback
    const dataParam = data || new Date().toISOString().split('T')[0];
    return `${API_BASE_URL}/soc?data=${dataParam}`;
}

function gerarSenhaAleatoria() {
  const letra = String.fromCharCode(65 + Math.floor(Math.random() * 3));
  const numero = (100 + Math.floor(Math.random() * 900)).toString();
  return letra + numero;
}

function formatarDataHora(dataISO) {
  if (!dataISO) return "";
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return dataISO;
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, '0');
  const min = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${min}`;
}

// Garantir que só a data apareça no campo Horário:
function formatarData(dataISO) {
  if (!dataISO) return "";
  // Tenta extrair só a parte da data se vier no formato 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm:ss'
  const match = dataISO.match(/(\d{4}-\d{2}-\d{2})/);
  let dataStr = match ? match[1] : dataISO;
  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return dataStr;
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function gerarSenhaSemAgendamento() {
  // Gera senha única do tipo S12345 (S + 5 dígitos aleatórios)
  let senha;
  do {
    senha = 'S' + Math.floor(10000 + Math.random() * 90000); // 5 dígitos
  } while (window.ultimasSenhasSemAgendamento && window.ultimasSenhasSemAgendamento.includes(senha));
  // Armazena últimas senhas geradas na sessão para evitar duplicidade
  if (!window.ultimasSenhasSemAgendamento) window.ultimasSenhasSemAgendamento = [];
  window.ultimasSenhasSemAgendamento.push(senha);
  if (window.ultimasSenhasSemAgendamento.length > 100) window.ultimasSenhasSemAgendamento.shift();
  return senha;
}

async function registrarSenhaSemAgendamento(senha) {
  try {
    const res = await fetch(`${API_BASE_URL}/senhas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha }) // Não envia nome!
    });
    if (!res.ok) throw new Error('Erro ao registrar senha no backend');
    return true;
  } catch (e) {
    return false;
  }
}

function render() {
  const app = document.getElementById("app");
  if (step === 0) {
    app.innerHTML = `
      <div class="text-7xl font-extrabold text-white pb-12">
        <img src="../assets/images/Vector.svg" alt="Safe Totem" class="max-w-4xl w-full h-auto" />
      </div>
      <div class="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Bem-vindo ao Autoatendimento</div>
      <button class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 mx-auto block" onclick="proximoPasso()">Iniciar atendimento</button>
    `;
  } else if (step === 1) {
    app.innerHTML = `
      <div class="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Digite seu CPF</div>
      <input class="w-[90%] mx-auto block py-6 px-12 rounded-xl border-none text-2xl mb-7 outline-auto bg-white/70 shadow-md transition-all duration-200 focus:shadow-lg focus:bg-white focus:shadow-blue-500/15 placeholder:text-gray-400" id="cpfInput" placeholder="Digite seu CPF" maxlength="14" />
      <button class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 mx-auto block" onclick="buscarPorCPF()">Buscar</button>
      <div class="text-red-500 mt-5 text-2xl text-center bg-white/70 rounded-lg py-2" id="erro"></div>
    `;
    document.getElementById("cpfInput").focus();
  } else if (step === 2 && paciente && consulta) {
    app.innerHTML = `
      <div class="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Confirme seus dados</div>
      <div class="text-gray-800 text-2xl mb-7 text-center bg-white/50 rounded-xl py-4">
        <b>Nome:</b> ${paciente.NOMEFUNCIONARIO}<br>
        <b>CPF:</b> ${paciente.CPFFUNCIONARIO}<br>
        <b>Horário:</b> ${formatarData(consulta.DATACOMPROMISSO)}
      </div>
      <div class="w-[90%] mx-auto flex flex-col gap-4">
        <button class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 w-[90%] block box-border mx-auto" onclick="confirmarAtendimento()">Confirmar e gerar senha</button>
        <button class="bg-transparent text-blue-500 border-2 border-blue-500 rounded-xl py-6 px-14 mx-9 mt-4 text-2xl font-bold cursor-pointer w-[90%] block transition-all duration-200 hover:bg-blue-50 hover:text-secondary-500 hover:border-secondary-500" onclick="voltarInicio()">Voltar</button>
      </div>
    `;
  } else if (step === 3 && senha) {
    app.innerHTML = `
      <div class="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Sua senha de atendimento</div>
      <div class="bg-white text-blue-500 text-6xl font-black rounded-[20px] py-9 px-18 my-9 shadow-lg tracking-wider">${senha}</div>
      <div class="text-gray-800 text-2xl mb-7 text-center bg-white/50 rounded-xl py-4">Por favor, aguarde ser chamado no painel.<br>Obrigado!</div>
      <button class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 mx-auto block" onclick="voltarInicio()">Novo atendimento</button>
    `;
  } else if (step === 4) {
    // Tela para cadastrar pessoa não encontrada no SOC
    app.innerHTML = `
      <div class="text-gray-900 text-4xl font-bold mb-9 text-center tracking-wide">Digite seus dados</div>
      <input class="w-[90%] mx-auto block py-6 px-12 rounded-xl border-none text-2xl mb-7 outline-auto bg-white/70 shadow-md transition-all duration-200 focus:shadow-lg focus:bg-white focus:shadow-blue-500/15 placeholder:text-gray-400" id="cpfCadastroInput" placeholder="CPF" maxlength="14" value="${window.cpfNaoEncontrado || ''}" />
      <input class="w-[90%] mx-auto block py-6 px-12 rounded-xl border-none text-2xl mb-7 outline-auto bg-white/70 shadow-md transition-all duration-200 focus:shadow-lg focus:bg-white focus:shadow-blue-500/15 placeholder:text-gray-400" id="nomeInput" placeholder="Nome completo" />
      <button class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-2xl font-bold cursor-pointer mt-4 shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 mx-auto block" onclick="confirmarCadastro()">Confirmar e gerar senha</button>
      <button class="bg-transparent text-blue-500 border-2 border-blue-500 rounded-xl py-6 px-14 mx-9 mt-4 text-2xl font-bold cursor-pointer w-[90%] block transition-all duration-200 hover:bg-blue-50 hover:text-secondary-500 hover:border-secondary-500" onclick="voltarInicio()">Voltar</button>
      <div class="text-red-500 mt-5 text-2xl text-center bg-white/70 rounded-lg py-2" id="erroCadastro"></div>
    `;
    document.getElementById("nomeInput").focus();
  }
}

function proximoPasso() {
  step = 1;
  render();
}

async function buscarPorCPF() {
  const cpf = document.getElementById("cpfInput").value.trim();
  const erroDiv = document.getElementById("erro");
  erroDiv.innerText = "";
  
  if (!cpf) {
    erroDiv.innerText = "Digite um CPF válido.";
    return;
  }

  // Carregar dados do SOC se ainda não carregou
  if (consultasSOC.length === 0) {
    try {
      // Buscar SOC com data de hoje
      const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const socUrl = getSOCUrl(hoje);
      const res = await fetch(socUrl);
      consultasSOC = await res.json();
    } catch (e) {
      erroDiv.innerText = "Erro ao buscar dados do SOC.";
      return;
    }
  }

  // Normalizar CPF para apenas números
  const cpfLimpo = cpf.replace(/\D/g, "");

  // Buscar por CPF
  const consultasPaciente = consultasSOC.filter((c) => {
    const cpfConsulta = c.CPFFUNCIONARIO ? c.CPFFUNCIONARIO.toString().replace(/\D/g, "") : "";
    return cpfConsulta === cpfLimpo;
  });

  if (consultasPaciente.length === 0) {
    // CPF não encontrado no SOC - vai para tela de cadastro
    window.cpfNaoEncontrado = cpf;
    step = 4;
    render();
  } else {
    // CPF encontrado - mostra dados do agendamento
    paciente = consultasPaciente[0];
    consulta = consultasPaciente[0];
    step = 2;
    render();
  }
}

async function confirmarCadastro() {
  const nome = document.getElementById("nomeInput").value.trim();
  const cpf = document.getElementById("cpfCadastroInput").value.trim();
  const erroCadastroDiv = document.getElementById("erroCadastro");
  
  if (!nome || !cpf) {
    erroCadastroDiv.innerText = "Preencha todos os campos.";
    return;
  }

  // Gera senha para pessoa sem agendamento (com 'S')
  const senhaGerada = gerarSenhaSemAgendamento();
  
  try {
    const res = await fetch(`${API_BASE_URL}/senhas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        senha: senhaGerada,
        nome: nome,
        cpf: cpf
      })
    });
    
    if (res.ok) {
      senha = senhaGerada;
      step = 3;
      render();
    } else {
      erroCadastroDiv.innerText = "Erro ao gerar senha. Tente novamente.";
    }
  } catch (e) {
    erroCadastroDiv.innerText = "Erro ao gerar senha. Tente novamente.";
  }
}

async function confirmarAtendimento() {
  // Usa o código do funcionário do SOC como senha
  senha = paciente.CODIGOFUNCIONARIO || "N/A";

  try {
    await fetch(`${API_BASE_URL}/senhas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senha: senha,
        nome: paciente.NOMEFUNCIONARIO,
        cpf: paciente.CPFFUNCIONARIO,
      }),
    });
    // erro silencioso
  } catch (e) {
    // erro silencioso
  }
  step = 3;
  render();
}

function voltarInicio() {
  step = 0;
  nome = "";
  senha = "";
  paciente = null;
  consulta = null;
  window.cpfNaoEncontrado = null;
  render();
}

function voltarInicioSemAgendamento() {
  step = 0;
  window.senhaSemAgendamentoAtual = null;
  window.senhaSemAgendamentoRegistrada = false;
  window.cpfNaoEncontrado = null;
  render();
}

function abrirCadastroAtendente() {
  step = 6;
  render();
}

function mostrarModalSenha(senha, callback) {
  // Cria o modal
  let modal = document.createElement('div');
  modal.id = 'modalSenha';
  modal.className = 'fixed top-0 left-0 w-screen h-screen bg-black/40 flex items-center justify-center z-[9999]';
  modal.innerHTML = `
    <div class="bg-white rounded-3xl p-12 shadow-2xl text-center min-w-[320px]">
      <div class="text-3xl font-bold text-blue-500 mb-6">Senha gerada</div>
      <div class="text-5xl font-black text-secondary-500 mb-8">${senha}</div>
      <button id="fecharModalSenha" class="bg-gradient-to-r from-blue-500 to-secondary-500 text-white border-none rounded-xl py-6 px-14 text-xl font-bold cursor-pointer shadow-lg transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:scale-105 max-w-[200px]">OK</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('fecharModalSenha').onclick = function() {
    document.body.removeChild(modal);
    if (callback) callback();
  };
}

async function registrarSemAgendamento() {
  // Atualiza nome e cpf do primeiro da fila
  const nome = document.getElementById('nomeCadastroInput').value.trim();
  const cpf = document.getElementById('cpfCadastroInput').value.trim();
  const senha = document.getElementById('senhaInput').value.trim();
  if (!nome || !cpf) {
    alert('Preencha nome e CPF!');
    return;
  }
  filaSemAgendamento[0].nome = nome;
  filaSemAgendamento[0].cpf = cpf;
  // Envia para o backend
  try {
    await fetch(`${API_BASE_URL}/usuarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha, nome, cpf })
    });
  } catch (e) {
    alert('Erro ao cadastrar no backend!');
    return;
  }
  // Mostra modal com a senha
  mostrarModalSenha(senha, () => {
    // Remove da fila e renderiza próximo
    filaSemAgendamento.shift();
    render();
  });
}

function pularCadastroSemAgendamento() {
  // Remove da fila sem registrar
  filaSemAgendamento.shift();
  render();
}

function confirmarESalvarSenhaSemAgendamento() {
  registrarSenhaSemAgendamento(window.senhaSemAgendamentoAtual).then(sucesso => {
    if (sucesso) {
      window.senhaSemAgendamentoRegistrada = true;
      const erroDiv = document.getElementById('erroSenhaSemAgendamento');
      if (erroDiv) {
        erroDiv.innerHTML = "";
      }
    }
  });
}

// Torna funções globais para uso nos botões inline
window.proximoPasso = proximoPasso;
window.buscarPorCPF = buscarPorCPF;
window.confirmarAtendimento = confirmarAtendimento;
window.confirmarCadastro = confirmarCadastro;
window.voltarInicio = voltarInicio;
window.voltarInicioSemAgendamento = voltarInicioSemAgendamento;
window.abrirCadastroAtendente = abrirCadastroAtendente;
window.registrarSemAgendamento = registrarSemAgendamento;
window.pularCadastroSemAgendamento = pularCadastroSemAgendamento;
window.confirmarESalvarSenhaSemAgendamento = confirmarESalvarSenhaSemAgendamento;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  render();

  // Adicione um botão para a atendente acessar a tela de cadastro (exemplo: F2)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'F2') {
      abrirCadastroAtendente();
    }
  });
});

