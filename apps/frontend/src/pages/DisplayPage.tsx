import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useSocket } from "../socket/useSocket";
import LegacyBackground from "../components/LegacyBackground";
import { senhaCurta } from "../utils/senha";

type PainelRow = {
  senha: string;
  nome: string | null;
  cpf?: string | null;
  status: string;
  encaminhamento?: any;
  called_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  profiles?: { nome?: string | null; specialty?: string | null } | null;
};

export default function DisplayPage() {
  const nav = useNavigate();

  // Painel público: sem login
  const { socket, status: socketStatus, lastError } = useSocket({ publicDisplay: true });
  const [pendentes, setPendentes] = useState<PainelRow[]>([]);
  const [emAtendimento, setEmAtendimento] = useState<PainelRow[]>([]);
  const [highlight, setHighlight] = useState<{
    senha: string;
    nome?: string | null;
    sala?: string | null;
    reason?: string | null;
  } | null>(null);

  const title = useMemo(() => `Painel (${socketStatus})`, [socketStatus]);

  async function load() {
    const [p, e] = await Promise.all([
      apiFetch<PainelRow[]>("/painel/pendentes", { method: "GET" }),
      apiFetch<PainelRow[]>("/painel/em_atendimento", { method: "GET" })
    ]);
    setPendentes(Array.isArray(p) ? p : []);
    setEmAtendimento(Array.isArray(e) ? e : []);
  }

  useEffect(() => {
    load().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onQueue = () => load().catch(() => null);
    const onAnn = (payload: any) => {
      const senha = String(payload?.senha || "").trim();
      if (!senha) return;
      setHighlight({
        senha,
        nome: payload?.nome ?? null,
        sala: payload?.sala ?? null,
        reason: payload?.reason ?? null
      });
      setTimeout(() => setHighlight(null), 8000);
      load().catch(() => null);
    };
    socket.on("queue_update", onQueue);
    socket.on("public_announcement", onAnn);
    return () => {
      socket.off("queue_update", onQueue);
      socket.off("public_announcement", onAnn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  return (
    <div className="font-['Inter',sans-serif] bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex flex-col relative overflow-x-hidden">
      <LegacyBackground variant="app" />

      <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white py-4 px-6 flex items-center justify-between shadow-lg sticky top-0 z-[100]">
        <div className="flex items-center gap-4">
          <button
            className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition flex items-center gap-2"
            onClick={() => nav("/dashboard")}
            title="Voltar ao Dashboard"
          >
            <i className="fas fa-arrow-left" />
            <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="flex items-center gap-3 text-xl font-bold">
            <i className="fas fa-tv text-2xl" />
            <span className="hidden md:inline">Painel de Senhas</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs opacity-90">{socketStatus}</span>
          <button className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition" onClick={() => load()}>
            <i className="fas fa-sync-alt mr-2" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center py-10 px-5 relative z-10">
        <div className="w-full max-w-[1400px]">
          {lastError ? <div className="mb-4 bg-red-100 text-red-800 py-3 px-4 rounded-lg text-sm">{lastError}</div> : null}

          {highlight ? (
            <div className="mb-6 rounded-3xl p-8 text-center shadow-2xl"
              style={{
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)"
              }}
            >
              <div className="text-white/90 text-xl font-semibold">
                {highlight.reason === "referred" ? "Encaminhado" : "Chamando agora"}
              </div>
              <div className="mt-3 text-[72px] leading-none font-black tracking-wider text-white">
                {senhaCurta(highlight.senha) || highlight.senha}
              </div>
              <div className="mt-4 text-3xl font-bold text-white">{highlight.nome || "Paciente"}</div>
              <div className="mt-2 text-xl text-white/90">
                {highlight.sala ? `Sala: ${highlight.sala}` : "Dirija-se ao consultório"}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="legacy-panel rounded-3xl p-6 shadow-2xl border border-white/20">
              <div className="text-2xl font-extrabold text-gray-800 flex items-center gap-3">
                <i className="fas fa-stethoscope text-blue-600" />
                Em atendimento
              </div>
              <div className="mt-5 grid gap-4">
                {emAtendimento.length === 0 ? (
                  <div className="text-gray-600">Nenhum atendimento em andamento.</div>
                ) : (
                  emAtendimento.slice(0, 8).map((s) => (
                    <div
                      key={s.senha}
                      className="rounded-2xl p-5 text-white shadow-xl"
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)" }}
                    >
                      <div className="text-5xl font-black tracking-wide">{senhaCurta(s.senha) || s.senha}</div>
                      <div className="mt-2 text-2xl font-bold">{(s.nome || "Paciente").replace(/ \\[EM ATENDIMENTO - .+?\\]$/, "")}</div>
                      {s.encaminhamento?.salaDestino ? (
                        <div className="mt-1 text-lg text-white/90">Destino: {String(s.encaminhamento.salaDestino)}</div>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="legacy-panel rounded-3xl p-6 shadow-2xl border border-white/20">
              <div className="text-2xl font-extrabold text-gray-800 flex items-center gap-3">
                <i className="fas fa-list text-blue-600" />
                Fila
              </div>
              <div className="mt-5 grid gap-3">
                {pendentes.length === 0 ? (
                  <div className="text-gray-600">Fila vazia.</div>
                ) : (
                  pendentes.slice(0, 12).map((s) => (
                    <div key={s.senha} className="rounded-2xl bg-white shadow p-5 flex items-center justify-between">
                      <div>
                        <div className="text-4xl font-black text-blue-600">{senhaCurta(s.senha) || s.senha}</div>
                        <div className="text-gray-700 text-lg font-semibold">{s.nome || "Paciente"}</div>
                        {s.encaminhamento?.salaDestino ? (
                          <div className="text-gray-600 text-sm font-medium mt-1">
                            Destino: {String(s.encaminhamento.salaDestino)}
                          </div>
                        ) : null}
                      </div>
                      <div className="text-sm text-gray-500 font-medium">{s.status}</div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

