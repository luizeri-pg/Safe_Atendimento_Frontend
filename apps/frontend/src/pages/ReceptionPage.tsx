import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { clearSession, getStoredUser } from "../auth/storage";
import { useSocket } from "../socket/useSocket";
import LegacyBackground from "../components/LegacyBackground";
import { senhaCurta } from "../utils/senha";

type SenhaRow = {
  senha: string;
  nome: string | null;
  cpf: string | null;
  status: string;
  prioridade?: boolean | null;
  prioridade_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  encaminhamento?: any;
};

export default function ReceptionPage() {
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;
  if (role !== "atendente") return <Navigate to="/" replace />;

  const { socket, status: socketStatus } = useSocket();
  const [rows, setRows] = useState<SenhaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [senha, setSenha] = useState<string>("");
  const [cpf, setCpf] = useState<string>("");
  const [nome, setNome] = useState<string>("");
  const [prioridade, setPrioridade] = useState<boolean>(false);

  const title = useMemo(() => `Recepção (${socketStatus})`, [socketStatus]);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<SenhaRow[]>("/atendente/senhas", { method: "GET" });
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onQueue = () => load();
    const onAlert = (payload: any) => {
      const nextSenha = String(payload?.senha || "").trim();
      const nextCpf = String(payload?.cpf || "").trim();
      if (!nextSenha) return;
      setSenha(nextSenha);
      setCpf(nextCpf);
      setNome("");
      setPrioridade(false);
      setModalOpen(true);
    };
    socket.on("queue_update", onQueue);
    socket.on("alert_reception", onAlert);
    return () => {
      socket.off("queue_update", onQueue);
      socket.off("alert_reception", onAlert);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  async function submitTriage(e: React.FormEvent) {
    e.preventDefault();
    if (!senha || !cpf || !nome) return;
    await apiFetch("/atendimento/triar", {
      method: "POST",
      body: JSON.stringify({ senha, cpf, nome, soc_status: "nao_verificado", prioridade })
    });
    setModalOpen(false);
    await load();
  }

  function logout() {
    clearSession();
    window.location.href = "/login";
  }

  return (
    <div className="font-['Inter',sans-serif] bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex flex-col relative overflow-x-hidden">
      <LegacyBackground variant="app" />

      {/* Top Navigation (igual legado) */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-4 px-6 flex items-center justify-between shadow-lg sticky top-0 z-[100]">
        <div className="flex items-center">
          <a
            href="/"
            className="flex items-center gap-2 text-white no-underline py-2 px-4 rounded-lg transition-all duration-300 font-medium hover:bg-white/10"
          >
            <i className="fas fa-arrow-left" />
            <span className="hidden md:inline">Início</span>
          </a>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-3 text-xl font-bold">
            <i className="fas fa-user-nurse text-2xl" />
            <span className="hidden md:inline">Safe Atendimento</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 py-2 px-4 bg-white/10 rounded-lg font-medium">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-semibold text-sm">
              AT
            </div>
            <span className="hidden md:inline">{user?.nome || "Atendente"}</span>
          </div>
          <button
            className="bg-transparent border-none text-white text-lg cursor-pointer p-2 rounded-lg transition-all duration-300 hover:bg-white/10"
            onClick={logout}
            title="Sair"
          >
            <i className="fas fa-sign-out-alt" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center py-10 px-5 relative z-10">
        <div className="legacy-panel rounded-3xl p-6 md:p-12 shadow-2xl w-full max-w-[1000px] border border-white/20 md:m-0 m-5">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl inline-flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
              <i className="fas fa-user-nurse text-3xl text-white" />
            </div>
            <div className="text-3xl font-extrabold text-gray-800 mb-2">Painel do Atendente</div>
            <div className="text-base text-gray-500 font-medium">
              Gerencie as senhas e cadastros dos pacientes
            </div>
          </div>

          {error ? <div className="bg-red-100 text-red-800 py-3 px-4 rounded-lg mb-5 text-sm">{error}</div> : null}

          <div className="w-full flex flex-col gap-5" id="senhaListaReact">
            {loading ? (
              <div className="text-gray-600 text-center">Carregando…</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 px-5 text-gray-500">
                <i className="fas fa-inbox text-5xl mb-4 text-gray-300" />
                <h3 className="text-2xl font-semibold mb-2 text-gray-700">Nenhuma senha pendente</h3>
                <p className="text-base text-gray-500">As senhas aparecerão aqui quando houver pacientes aguardando</p>
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.senha}
                  className="relative overflow-hidden bg-white rounded-2xl p-6 flex items-center justify-between shadow-md border border-black/5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl md:flex-row flex-col gap-4 text-center md:text-left"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500 to-blue-700" />
                  <div className="flex items-center gap-5 flex-1">
                    <div className="text-3xl font-extrabold text-blue-500 min-w-[80px] text-center">
                      {senhaCurta(r.senha) || r.senha}
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2 flex-wrap">
                        {r.nome ? r.nome : r.cpf ? `Sem nome (CPF: ${r.cpf})` : "Sem nome"}
                        {r.prioridade ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                            PRIORITÁRIO
                          </span>
                        ) : null}
                      </div>
                      <div className="text-sm text-gray-500 font-medium">Status: {r.status}</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-center w-full md:w-auto justify-center">
                    <button
                      className="bg-gradient-to-br from-blue-500 to-blue-700 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-blue-500/30 whitespace-nowrap hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                      disabled={r.status !== "cadastro"}
                      onClick={() => {
                        setSenha(r.senha);
                        setCpf(String(r.cpf || ""));
                        setNome(String(r.nome || ""));
                        setModalOpen(true);
                      }}
                    >
                      <i className="fas fa-user-plus mr-2" />
                      Cadastrar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Botão de Refresh (igual legado) */}
      <button
        className="fixed bottom-8 right-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white border-none rounded-full w-16 h-16 text-xl cursor-pointer shadow-xl shadow-blue-500/30 transition-all duration-300 z-[100] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-500/40 active:translate-y-0 flex items-center justify-center"
        onClick={load}
        title="Atualizar dados"
      >
        <i className="fas fa-sync-alt" />
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] backdrop-blur-sm p-6">
          <div className="modal bg-white rounded-3xl p-6 md:p-8 w-full max-w-[420px] shadow-2xl relative">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200">
              <i className="fas fa-user-plus text-2xl text-blue-500" />
              <h3 className="text-xl font-bold text-gray-800">Cadastrar Paciente</h3>
              <button
                type="button"
                className="ml-auto bg-transparent border-none text-gray-600 text-lg cursor-pointer p-2 rounded-lg transition-all duration-300 hover:bg-gray-100"
                onClick={() => setModalOpen(false)}
              >
                <i className="fas fa-times" />
              </button>
            </div>
            <form onSubmit={submitTriage} autoComplete="off">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Nome Completo</label>
              <input
                className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
              />
              <label className="block text-sm font-semibold text-gray-700 mb-2 mt-4">CPF</label>
              <input
                className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                required
              />
              <label className="flex items-center gap-3 text-sm font-semibold text-gray-700 mt-4 select-none">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-blue-600"
                  checked={prioridade}
                  onChange={(e) => setPrioridade(e.target.checked)}
                />
                Prioritário
              </label>
              <div className="flex gap-3 mt-6 justify-end">
                <button
                  type="button"
                  className="bg-gray-100 text-gray-600 border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 hover:bg-gray-200"
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-gradient-to-br from-blue-500 to-blue-700 text-white border-none rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer transition-all duration-300 shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

