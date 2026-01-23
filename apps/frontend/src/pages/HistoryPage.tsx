import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { clearSession, getStoredUser } from "../auth/storage";
import { useSocket } from "../socket/useSocket";
import LegacyBackground from "../components/LegacyBackground";
import { senhaCurta } from "../utils/senha";

type SenhaRow = {
  senha: string;
  nome: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

function formatarHora(ts: string | null | undefined) {
  if (!ts) return "--:--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isTodayLocal(ts: string | null | undefined) {
  if (!ts) return false;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function HistoryPage() {
  const nav = useNavigate();
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;

  const { socket } = useSocket();
  const [rows, setRows] = useState<SenhaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = rows.length;
    const atendidas = rows.filter((s) => s.status === "atendida").length;
    const pendentes = rows.filter((s) => s.status === "pendente").length;
    const cadastros = rows.filter((s) => s.status === "cadastro").length;
    return { total, atendidas, pendentes, cadastros };
  }, [rows]);

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<SenhaRow[]>(
        `/supa/senhas?select=senha,nome,status,created_at,updated_at&order=updated_at.desc&limit=500`,
        { method: "GET" }
      );
      const all = Array.isArray(data) ? data : [];
      // Histórico “do dia” (igual legado)
      const today = all
        .filter((s) => isTodayLocal(s.updated_at || s.created_at))
        .sort((a, b) => {
          const da = new Date(a.updated_at || a.created_at || 0).getTime();
          const db = new Date(b.updated_at || b.created_at || 0).getTime();
          return db - da;
        });
      setRows(today);
    } catch (e: any) {
      setRows([]);
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
    socket.on("queue_update", onQueue);
    return () => {
      socket.off("queue_update", onQueue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  function logout() {
    if (!confirm("Deseja realmente sair do sistema?")) return;
    clearSession();
    nav("/login", { replace: true });
  }

  return (
    <div className="font-['Inter',sans-serif] bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex flex-col relative overflow-x-hidden">
      <LegacyBackground variant="app" />

      {/* Top Navigation (igual legado) */}
      <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-4 px-6 flex items-center justify-between shadow-lg sticky top-0 z-[100]">
        <div className="flex items-center">
          <button
            onClick={() => nav("/dashboard")}
            className="flex items-center gap-2 text-white no-underline py-2 px-4 rounded-lg transition-all duration-300 font-medium hover:bg-white/10"
          >
            <i className="fas fa-arrow-left" />
            <span className="hidden md:inline">Voltar ao Dashboard</span>
          </button>
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-3 text-xl font-bold">
            <i className="fas fa-chart-line text-2xl" />
            <span className="hidden md:inline">Safe Atendimento</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 py-2 px-4 bg-white/10 rounded-lg font-medium">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-semibold text-sm">
              {(String(user?.nome || user?.username || "AD").trim().slice(0, 2) || "AD").toUpperCase()}
            </div>
            <span className="hidden md:inline">{user?.nome || user?.username}</span>
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
        <div className="legacy-panel rounded-3xl p-6 md:p-12 shadow-2xl w-full max-w-[1200px] border border-white/20 md:m-0 m-5">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl inline-flex items-center justify-center mb-5 shadow-lg shadow-blue-500/30">
              <i className="fas fa-chart-line text-3xl text-white" />
            </div>
            <div className="text-3xl font-extrabold text-gray-800 mb-2">Histórico de Senhas</div>
            <div className="text-base text-gray-500 font-medium">Relatório completo de atendimentos do dia</div>
          </div>

          {/* Estatísticas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-2xl text-center shadow-xl shadow-blue-500/30">
              <div className="text-3xl font-extrabold mb-2">{loading ? "…" : stats.total}</div>
              <div className="text-sm opacity-90 font-medium">Total de Senhas</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-2xl text-center shadow-xl shadow-blue-500/30">
              <div className="text-3xl font-extrabold mb-2">{loading ? "…" : stats.atendidas}</div>
              <div className="text-sm opacity-90 font-medium">Atendidas</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-2xl text-center shadow-xl shadow-blue-500/30">
              <div className="text-3xl font-extrabold mb-2">{loading ? "…" : stats.pendentes}</div>
              <div className="text-sm opacity-90 font-medium">Pendentes</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 rounded-2xl text-center shadow-xl shadow-blue-500/30">
              <div className="text-3xl font-extrabold mb-2">{loading ? "…" : stats.cadastros}</div>
              <div className="text-sm opacity-90 font-medium">Cadastros</div>
            </div>
          </div>

          {error ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-gray-700 mb-6">
              <i className="fas fa-exclamation-triangle text-yellow-600 mr-2" />
              {error}
            </div>
          ) : null}

          {/* Tabela */}
          {loading ? (
            <div className="text-center py-10 text-gray-500">
              <i className="fas fa-spinner fa-spin text-5xl mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold mb-2">Carregando histórico...</h3>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 px-5 text-gray-500">
              <i className="fas fa-inbox text-5xl mb-4 text-gray-300" />
              <h3 className="text-2xl font-semibold mb-2 text-gray-700">Nenhuma senha registrada hoje</h3>
              <p className="text-base text-gray-500">O histórico será atualizado automaticamente quando houver movimentação</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden shadow-xl border border-black/5">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide">
                      <i className="fas fa-ticket-alt mr-2" />
                      Senha
                    </th>
                    <th className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide">
                      <i className="fas fa-user mr-2" />
                      Nome
                    </th>
                    <th className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide">
                      <i className="fas fa-info-circle mr-2" />
                      Status
                    </th>
                    <th className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-5 px-4 text-left font-semibold text-sm uppercase tracking-wide">
                      <i className="fas fa-clock mr-2" />
                      Horário
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const statusText = String(s.status || "").trim() || "—";
                    let badge = "inline-block py-1.5 px-3 rounded-full text-xs font-semibold uppercase tracking-wide";
                    if (s.status === "pendente") badge += " bg-yellow-100 text-yellow-700";
                    else if (s.status === "atendida") badge += " bg-green-100 text-green-700";
                    else if (s.status === "cadastro") badge += " bg-blue-100 text-blue-700";
                    else badge += " bg-gray-100 text-gray-700";

                    const ts = s.updated_at || s.created_at || null;
                    return (
                      <tr key={s.senha} className="hover:bg-gray-50 transition-colors">
                        <td className="py-5 px-4 border-b border-gray-100 text-lg font-bold text-blue-500">
                          {senhaCurta(s.senha) || s.senha}
                        </td>
                        <td className="py-5 px-4 border-b border-gray-100 text-base font-medium text-gray-800">
                          {s.nome || "Sem nome"}
                        </td>
                        <td className="py-5 px-4 border-b border-gray-100">
                          <span className={badge}>{statusText}</span>
                        </td>
                        <td className="py-5 px-4 border-b border-gray-100 text-gray-500 font-medium">
                          {formatarHora(ts)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Botão de Refresh */}
      <button
        className="fixed bottom-8 right-8 bg-gradient-to-br from-blue-500 to-blue-700 text-white border-none rounded-full w-16 h-16 text-xl cursor-pointer shadow-xl shadow-blue-500/30 transition-all duration-300 z-[100] hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-blue-500/40 active:translate-y-0 flex items-center justify-center"
        onClick={load}
        title="Atualizar dados"
      >
        <i className="fas fa-sync-alt" />
      </button>
    </div>
  );
}

