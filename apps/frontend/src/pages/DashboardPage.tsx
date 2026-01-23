import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { clearSession, getStoredUser } from "../auth/storage";
import { senhaCurta } from "../utils/senha";

type DashboardStats = {
  pacientesHoje: number;
  consultasHojeSoc: number;
  consultasRealizadasHoje: number;
  naFilaHoje: number;
  tempoMedioMin: number;
};

type DashboardSection = "dashboard" | "pacientes" | "consultas";

type SocConsulta = {
  NOMEFUNCIONARIO?: string;
  CPFFUNCIONARIO?: string | number;
  CODIGOFUNCIONARIO?: string | number;
  DATACOMPROMISSO?: string; // normalmente DD/MM/YYYY
};

type SenhaRow = {
  senha: string;
  nome: string | null;
  status: string;
  updated_at?: string | null;
  created_at?: string | null;
};

export default function DashboardPage() {
  const nav = useNavigate();
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;
  const isAtendimento = role === "medico" || role === "enfermagem" || role === "fono";
  const isAtendente = role === "atendente";
  const medicalPanelLabel = role === "fono" ? "Painel Fono" : "Painel Médico";

  const displayName = useMemo(() => {
    const base = String(user?.nome || user?.username || "Usuário").trim();
    if (role === "medico" && !/^dr\.?\s/i.test(base)) return `Dr. ${base}`;
    return base;
  }, [role, user?.nome, user?.username]);

  const roleLabel =
    role === "medico"
      ? "Médico"
      : role === "enfermagem"
        ? "Enfermagem"
        : role === "fono"
          ? "Fonoaudiologia"
          : role === "atendente"
            ? "Atendente"
            : "Usuário";

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [section, setSection] = useState<DashboardSection>("dashboard");

  // Pacientes (SOC)
  const [socPatientsAll, setSocPatientsAll] = useState<SocConsulta[]>([]);
  const [socLoading, setSocLoading] = useState(false);
  const [socError, setSocError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");

  // Consultas (senhas do dia)
  const [consultas, setConsultas] = useState<SenhaRow[]>([]);
  const [consultasLoading, setConsultasLoading] = useState(false);
  const [consultasError, setConsultasError] = useState<string | null>(null);

  function getHojeLocalISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  function getHojeBR() {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }
  function formatarCPF(cpf: unknown) {
    if (!cpf) return "N/A";
    const digits = String(cpf).replace(/\D/g, "");
    if (digits.length !== 11) return String(cpf);
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  function formatarDataSOC(dataStr: unknown) {
    if (!dataStr) return "Não agendado";
    const raw = String(dataStr).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  async function loadStats() {
    try {
      const data = await apiFetch<DashboardStats>("/dashboard/stats", { method: "GET" });
      setStats(data);
    } catch {
      setStats(null);
    }
  }

  async function loadPatientsFromSOC() {
    setSocError(null);
    setSocLoading(true);
    try {
      const iso = getHojeLocalISO();
      const raw = await apiFetch<any>(`/soc?data=${encodeURIComponent(iso)}`, { method: "GET" });
      const arr: any[] = Array.isArray(raw) ? raw : [];

      const hojeBR = getHojeBR();
      const doDia = arr.filter((c) => {
        const dt = c?.DATACOMPROMISSO != null ? String(c.DATACOMPROMISSO).trim() : "";
        return dt === hojeBR;
      }) as SocConsulta[];

      setSocPatientsAll(doDia);
    } catch (e: any) {
      setSocPatientsAll([]);
      setSocError(String(e?.message || e));
    } finally {
      setSocLoading(false);
    }
  }

  const socPatientsFiltered = useMemo(() => {
    const term = String(patientSearch || "").trim();
    if (!term) return socPatientsAll;

    const termLower = term.toLowerCase();
    const termNumbers = term.replace(/\D/g, "");
    const isOnlyNumbers = /^\d+$/.test(term);

    return socPatientsAll.filter((consulta) => {
      const nome = String(consulta.NOMEFUNCIONARIO || "").toLowerCase();
      const cpf = consulta.CPFFUNCIONARIO ? String(consulta.CPFFUNCIONARIO).replace(/\D/g, "") : "";
      const codigo = String(consulta.CODIGOFUNCIONARIO || "");

      if (isOnlyNumbers && termNumbers.length <= 6) {
        if (codigo === term || codigo.startsWith(term)) return true;
        if (nome.includes(termLower)) return true;
        return false;
      }

      return (
        nome.includes(termLower) ||
        (termNumbers.length >= 7 && cpf.includes(termNumbers)) ||
        codigo.toLowerCase().includes(termLower)
      );
    });
  }, [patientSearch, socPatientsAll]);

  async function loadConsultasFromSenhas() {
    setConsultasError(null);
    setConsultasLoading(true);
    try {
      const data = await apiFetch<SenhaRow[]>(
        `/supa/senhas?select=senha,nome,status,created_at,updated_at&order=updated_at.desc&limit=500`,
        { method: "GET" }
      );
      const all = Array.isArray(data) ? data : [];
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const hojeRows = all
        .filter((s) => {
          const ts = s.updated_at || s.created_at;
          if (!ts) return false;
          const d = new Date(ts);
          return d >= hoje;
        })
        .sort((a, b) => {
          const da = new Date(a.updated_at || a.created_at || 0).getTime();
          const db = new Date(b.updated_at || b.created_at || 0).getTime();
          return db - da;
        });
      setConsultas(hojeRows);
    } catch (e: any) {
      setConsultas([]);
      setConsultasError(String(e?.message || e));
    } finally {
      setConsultasLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  function logout() {
    clearSession();
    nav("/login", { replace: true });
  }

  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      <div className="flex min-h-screen">
        {/* Sidebar (legado) */}
        <nav
          className={[
            "w-[280px] bg-gradient-to-br from-blue-500 to-blue-700 text-white py-6 fixed h-screen overflow-y-auto z-[1000] transition-transform duration-300",
            sidebarOpen ? "" : "-translate-x-full"
          ].join(" ")}
        >
          <div className="px-6 pb-8 border-b border-white/10 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <i className="fas fa-user-md text-3xl text-white" />
              <h1 className="text-xl font-extrabold">Safe Atendimento</h1>
            </div>
            <div className="text-sm opacity-80 ml-10">Sistema de Gestão Médica</div>
          </div>

          <div className="px-4">
            <div className="mb-8">
              <div className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-3 px-4">Atendimento</div>
              <button
                className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10 bg-white/20 font-semibold"
                onClick={() => setSection("dashboard")}
              >
                <i className="fas fa-home text-base w-5 text-center" />
                <span className="text-sm">Dashboard</span>
              </button>

              <button
                className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                onClick={() => {
                  setSection("pacientes");
                  if (!socPatientsAll.length) loadPatientsFromSOC();
                }}
              >
                <i className="fas fa-users text-base w-5 text-center" />
                <span className="text-sm">Pacientes</span>
              </button>

              <button
                className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                onClick={() => {
                  setSection("consultas");
                  loadConsultasFromSenhas();
                }}
              >
                <i className="fas fa-calendar-alt text-base w-5 text-center" />
                <span className="text-sm">Consultas</span>
              </button>

              {isAtendente ? (
                <button
                  className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                  onClick={() => nav("/reception")}
                >
                  <i className="fas fa-user-nurse text-base w-5 text-center" />
                  <span className="text-sm">Painel Atendente</span>
                </button>
              ) : null}
              {isAtendimento ? (
                <button
                  className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                  onClick={() => nav("/medical")}
                >
                  <i className="fas fa-user-md text-base w-5 text-center" />
                  <span className="text-sm">{medicalPanelLabel}</span>
                </button>
              ) : null}
              <button
                className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                onClick={() => nav("/display")}
              >
                <i className="fas fa-tv text-base w-5 text-center" />
                <span className="text-sm">Painel Público</span>
              </button>
              <button
                className="w-full text-left flex items-center gap-3 py-3 px-4 mb-1 rounded-lg transition-all duration-300 text-white hover:bg-white/10"
                onClick={() => nav("/history")}
              >
                <i className="fas fa-chart-line text-base w-5 text-center" />
                <span className="text-sm">Histórico</span>
              </button>
            </div>
          </div>

          <div className="absolute bottom-6 left-6 right-6 p-4 bg-white/10 rounded-xl backdrop-blur-lg">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center mb-2">
              <i className="fas fa-user" />
            </div>
            <div className="font-semibold text-sm mb-1">{displayName}</div>
            <div className="text-xs opacity-80">{roleLabel}</div>
          </div>
        </nav>

        {/* Main content */}
        <main className={["flex-1 transition-all duration-300", sidebarOpen ? "ml-[280px]" : "ml-0"].join(" ")}>
          {/* Topbar */}
          <div className="bg-white py-4 px-6 border-b border-gray-200 flex items-center justify-between sticky top-0 z-[100]">
            <div className="flex items-center gap-4">
              <button
                className="bg-transparent border-none text-xl text-gray-700 cursor-pointer p-2 rounded-lg transition-colors duration-300 hover:bg-gray-50"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-label="Alternar menu"
              >
                <i className="fas fa-bars" />
              </button>
              <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative cursor-pointer p-2 rounded-lg transition-colors duration-300 hover:bg-gray-50">
                <i className="fas fa-bell" />
                <div className="absolute top-1 right-1 w-2 h-2 bg-red-600 rounded-full notification-badge" />
              </div>
              <div className="flex items-center gap-3 cursor-pointer p-2 px-3 rounded-lg transition-colors duration-300 hover:bg-gray-50">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center text-white font-semibold">
                  {(displayName.replace(/^dr\.?\s*/i, "") || "SA").slice(0, 2).toUpperCase()}
                </div>
                <span className="hidden sm:inline">{displayName}</span>
                <button
                  className="ml-2 text-red-600 hover:bg-red-50 rounded-lg px-3 py-2"
                  onClick={logout}
                  title="Sair"
                >
                  <i className="fas fa-sign-out-alt" />
                </button>
              </div>
            </div>
          </div>

          {/* Content area */}
          <div className="p-6">
            {section === "dashboard" ? (
              <>
                {/* Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-700">Pacientes Hoje</h3>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-lg text-white">
                        <i className="fas fa-users" />
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-gray-800 mb-2">{stats ? stats.pacientesHoje : "?"}</div>
                    <div className="text-sm font-medium text-gray-600">Baseado nas senhas atualizadas hoje</div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-700">Consultas Hoje (SOC)</h3>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center text-lg text-white">
                        <i className="fas fa-check-circle" />
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-gray-800 mb-2">{stats ? stats.consultasHojeSoc : "?"}</div>
                    <div className="text-sm font-medium text-gray-600">
                      Realizadas hoje: <strong>{stats ? stats.consultasRealizadasHoje : "?"}</strong>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-700">Na Fila</h3>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-lg text-white">
                        <i className="fas fa-clock" />
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-gray-800 mb-2">{stats ? stats.naFilaHoje : "?"}</div>
                    <div className="text-sm font-medium text-gray-600">Pendente + Cadastro (hoje)</div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-gray-700">Tempo Médio</h3>
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-lg text-white">
                        <i className="fas fa-stopwatch" />
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-gray-800 mb-2">{stats ? `${stats.tempoMedioMin}min` : "--"}</div>
                    <div className="text-sm font-medium text-gray-600">Estimativa (igual legado)</div>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200 mb-8">
                  <h3 className="text-lg font-bold text-gray-800 mb-5">Ações Rápidas</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Regras: médico/enfermagem/fono não veem Totem nem Painel Atendente */}
                    {!isAtendimento ? (
                      <button
                        className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                        onClick={() => nav("/totem")}
                      >
                        <i className="fas fa-plus text-xl" />
                        <span className="font-semibold text-sm">Novo Atendimento (Totem)</span>
                      </button>
                    ) : null}

                    {isAtendente ? (
                      <button
                        className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                        onClick={() => nav("/reception")}
                      >
                        <i className="fas fa-user-nurse text-xl" />
                        <span className="font-semibold text-sm">Painel Atendente</span>
                      </button>
                    ) : null}

                    {isAtendimento ? (
                      <button
                        className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                        onClick={() => nav("/medical")}
                      >
                        <i className="fas fa-user-md text-xl" />
                        <span className="font-semibold text-sm">{medicalPanelLabel}</span>
                      </button>
                    ) : null}
                    <button
                      className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                      onClick={() => nav("/display")}
                    >
                      <i className="fas fa-tv text-xl" />
                      <span className="font-semibold text-sm">Painel Público</span>
                    </button>
                    <button
                      className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                      onClick={() => nav("/history")}
                    >
                      <i className="fas fa-chart-line text-xl" />
                      <span className="font-semibold text-sm">Ver Histórico</span>
                    </button>
                    <button
                      className="flex items-center gap-3 py-4 px-5 bg-gray-50 border-2 border-gray-200 rounded-xl cursor-pointer transition-all duration-300 text-gray-700 hover:bg-gradient-to-r hover:from-blue-500 hover:to-blue-700 hover:text-white hover:-translate-y-0.5 hover:shadow-xl"
                      onClick={() => alert("Relatório: em desenvolvimento")}
                    >
                      <i className="fas fa-file-alt text-xl" />
                      <span className="font-semibold text-sm">Gerar Relatório</span>
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {section === "pacientes" ? (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">Pacientes do SOC</h2>
                    <p className="text-sm text-gray-600 mt-1">Pacientes agendados para hoje</p>
                  </div>
                  <div className="relative flex-1 md:max-w-md">
                    <input
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Buscar por nome, CPF ou código..."
                      className="w-full py-3 pl-10 pr-4 border-2 border-gray-200 rounded-lg text-sm transition-all duration-300 bg-white focus:outline-none focus:border-blue-500 focus:shadow-lg focus:shadow-blue-500/10"
                    />
                    <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {socError ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-gray-700 mb-4">
                    <i className="fas fa-exclamation-triangle text-yellow-600 mr-2" />
                    {socError}
                  </div>
                ) : null}

                <div className="mb-4 text-sm text-gray-600">
                  {socLoading
                    ? "Carregando…"
                    : socPatientsAll.length === 0
                      ? ""
                      : socPatientsAll.length === socPatientsFiltered.length
                        ? `${socPatientsFiltered.length} paciente(s) encontrado(s)`
                        : `Mostrando ${socPatientsFiltered.length} de ${socPatientsAll.length} paciente(s)`}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-2">
                  {socLoading ? (
                    <div className="col-span-full text-center py-10 text-gray-500">
                      <i className="fas fa-spinner fa-spin text-5xl mb-4 text-gray-300" />
                      <h3 className="text-lg font-semibold mb-2">Carregando pacientes do SOC...</h3>
                    </div>
                  ) : socPatientsFiltered.length === 0 ? (
                    <div className="col-span-full text-center py-10 text-gray-500">
                      <i className="fas fa-users text-5xl mb-4 text-gray-300" />
                      <h3 className="text-lg font-semibold mb-2">Nenhum paciente encontrado</h3>
                      <p className="text-sm">
                        {socPatientsAll.length ? "Tente ajustar os termos de busca" : "Não há pacientes agendados no SOC para hoje"}
                      </p>
                      <button
                        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                        onClick={loadPatientsFromSOC}
                      >
                        <i className="fas fa-redo mr-2" />
                        Atualizar
                      </button>
                    </div>
                  ) : (
                    socPatientsFiltered.map((c, idx) => {
                      const nome = c.NOMEFUNCIONARIO || "Sem nome";
                      const inicial = String(nome).charAt(0).toUpperCase();
                      const cpfFmt = formatarCPF(c.CPFFUNCIONARIO);
                      const codigo = c.CODIGOFUNCIONARIO != null ? String(c.CODIGOFUNCIONARIO) : "N/A";
                      const dt = formatarDataSOC(c.DATACOMPROMISSO);
                      return (
                        <div
                          key={`${codigo}-${idx}`}
                          className="bg-white rounded-xl p-4 shadow-md border border-gray-200 hover:shadow-lg transition-shadow"
                        >
                          <div className="flex items-center gap-4 mb-3">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-lg">
                              {inicial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-gray-800 truncate">{nome}</h4>
                              <p className="text-sm text-gray-600">CPF: {cpfFmt}</p>
                              <p className="text-sm text-gray-600">Código: {codigo}</p>
                            </div>
                          </div>
                          <div className="border-t border-gray-200 pt-3 mt-3">
                            <div className="flex items-center justify-between text-xs text-gray-600">
                              <span>
                                <i className="fas fa-calendar-alt mr-1" />
                                {dt}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}

            {section === "consultas" ? (
              <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-200">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Consultas</h2>
                  <button
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                    onClick={loadConsultasFromSenhas}
                  >
                    <i className="fas fa-sync-alt mr-2" />
                    Atualizar
                  </button>
                </div>

                {consultasError ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-gray-700 mb-4">
                    <i className="fas fa-exclamation-triangle text-yellow-600 mr-2" />
                    {consultasError}
                  </div>
                ) : null}

                <div className="bg-white rounded-xl p-2">
                  {consultasLoading ? (
                    <div className="text-center py-10 text-gray-500">
                      <i className="fas fa-spinner fa-spin text-5xl mb-4 text-gray-300" />
                      <h3 className="text-lg font-semibold mb-2">Carregando consultas...</h3>
                    </div>
                  ) : consultas.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">
                      <i className="fas fa-calendar-alt text-5xl mb-4 text-gray-300" />
                      <h3 className="text-lg font-semibold mb-2">Nenhuma consulta hoje</h3>
                      <p className="text-sm">As consultas aparecerão aqui quando houver atendimentos</p>
                    </div>
                  ) : (
                    consultas.map((s, idx) => {
                      const ts = s.updated_at || s.created_at || null;
                      const d = ts ? new Date(ts) : null;
                      const hora = d
                        ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                        : "--:--";
                      const nome = s.nome || "Sem nome";
                      const statusText = s.status === "atendida" ? "Atendido" : s.status === "pendente" ? "Aguardando" : "Cadastro";
                      const statusClass =
                        s.status === "atendida"
                          ? "bg-green-100 text-green-800"
                          : s.status === "pendente"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-blue-100 text-blue-800";

                      return (
                        <div
                          key={`${s.senha}-${idx}`}
                          className="flex items-center gap-4 p-4 border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors"
                        >
                          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold">
                            {hora}
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-gray-800 mb-1">{nome}</div>
                            <div className="text-sm text-gray-600 flex items-center gap-3">
                              <span>
                                Senha: <strong>{senhaCurta(s.senha) || s.senha}</strong>
                              </span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusClass}`}>{statusText}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

