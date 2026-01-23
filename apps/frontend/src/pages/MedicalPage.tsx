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
  encaminhamento?: any;
  medico_atendendo_id?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type DoctorProfile = { id: string; nome: string; specialty?: string | null };

export default function MedicalPage() {
  const user = getStoredUser();
  const role = String(user?.role || "").trim().toLowerCase();
  if (!role) return <Navigate to="/login" replace />;
  if (!(role === "medico" || role === "enfermagem" || role === "fono")) return <Navigate to="/" replace />;

  const { socket, status: socketStatus } = useSocket();
  const [rows, setRows] = useState<SenhaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const myId = String(user?.id || "").trim() || null;
  const localLabel = useMemo(() => {
    if (role === "medico") return "Consultório";
    if (role === "enfermagem") return "Exames 1 e Exames 2";
    return "Exames 3";
  }, [role]);

  const title = useMemo(() => `${role === "medico" ? "Painel de Atendimento" : "Painel de Exames"} (${socketStatus})`, [
    role,
    socketStatus
  ]);
  const hasMyActiveAttendance = useMemo(() => rows.some((r) => r.status === "em_atendimento"), [rows]);

  function normalizeRoom(s: unknown) {
    return String(s || "").trim().toLowerCase();
  }
  function normalizeEncaminhamento(raw: any) {
    if (!raw) return null;
    if (typeof raw === "object") return raw;
    if (typeof raw === "string") {
      const txt = raw.trim();
      if (!txt) return null;
      try {
        const parsed = JSON.parse(txt);
        return parsed && typeof parsed === "object" ? parsed : null;
      } catch {
        return null;
      }
    }
    return null;
  }
  function isEncaminhamentoExame(enc: any) {
    if (!enc) return false;
    const tipo = String(enc.tipo || "").trim().toLowerCase();
    const sala = normalizeRoom(enc.salaDestino || "");
    return tipo === "exame" || sala.includes("exame");
  }
  function matchesExamRoom(enc: any) {
    const sala = normalizeRoom(enc?.salaDestino || "");
    if (role === "fono") return sala.includes("exame 3") || sala.includes("exames 3") || sala.includes("sala de exame 3");
    // enfermagem: exame 1 e 2
    return sala.includes("exame 1") || sala.includes("exame 2") || sala.includes("sala de exame 1") || sala.includes("sala de exame 2");
  }

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const data = await apiFetch<SenhaRow[]>(
        `/supa/senhas?select=senha,nome,cpf,status,created_at,updated_at,encaminhamento,medico_atendendo_id&status=in.(pendente,em_atendimento)&order=updated_at.asc&limit=200`,
        { method: "GET" }
      );
      const all = Array.isArray(data) ? data : [];

      // Regra pedida:
      // - Todas as senhas/consultas aparecem no mesmo Painel (/medical), independente do perfil.
      // - Porém, cada perfil só consegue CHAMAR as que pertencem ao seu “local”.
      // - "Em atendimento" fica restrito ao próprio usuário (para finalizar/encaminhar sem confusão).
      const visible = all.filter((r) => {
        if (r.status === "pendente") return true;
        if (r.status === "em_atendimento") {
          if (!myId) return false;
          return String(r.medico_atendendo_id || "") === String(myId);
        }
        return false;
      });

      setRows(visible);
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
    socket.on("queue_update", onQueue);
    return () => {
      socket.off("queue_update", onQueue);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  async function chamar(senha: string) {
    await apiFetch("/atendimento/chamar", { method: "POST", body: JSON.stringify({ senha }) });
    await load();
  }

  async function finalizar(senha: string) {
    await apiFetch("/atendimento/finalizar", { method: "POST", body: JSON.stringify({ senha }) });
    await load();
  }

  // Encaminhamento (modal)
  const [encOpen, setEncOpen] = useState(false);
  const [encSenha, setEncSenha] = useState<string>("");
  const [encTipo, setEncTipo] = useState<"medico" | "enfermagem" | "fono" | "exame">("medico");
  const [encMotivo, setEncMotivo] = useState<string>("");
  const [doctors, setDoctors] = useState<(DoctorProfile & { role?: string | null })[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [salaExame, setSalaExame] = useState<string>("");
  const [encFromSalaExame, setEncFromSalaExame] = useState<string>("");

  async function loadDoctors() {
    try {
      // Médicos + Fono também são destinos válidos para encaminhar (tipo "medico" no backend)
      const data = await apiFetch<(DoctorProfile & { role?: string | null })[]>(
        `/supa/profiles?select=id,nome,role,specialty&role=in.(medico,fono)&order=nome.asc`,
        {
        method: "GET"
        }
      );
      const list = Array.isArray(data) ? data : [];
      // remover eu mesmo
      setDoctors(myId ? list.filter((d) => String(d.id) !== String(myId)) : list);
    } catch {
      setDoctors([]);
    }
  }

  function openEncaminhar(row: SenhaRow) {
    const senha = String(row?.senha || "").trim();
    if (!senha) return;
    setEncSenha(senha);
    setEncMotivo("");
    setDoctorId("");
    const enc = normalizeEncaminhamento(row?.encaminhamento);
    const salaDestino = enc?.salaDestino != null ? String(enc.salaDestino) : "";
    const salaNorm = normalizeRoom(salaDestino);
    const inferredSala = salaNorm.includes("exame 3")
      ? "Sala de exame 3"
      : salaNorm.includes("exame 2")
        ? "Sala de exame 2"
        : salaNorm.includes("exame 1")
          ? "Sala de exame 1"
          : "";
    setSalaExame(role === "fono" ? "Sala de exame 3" : inferredSala);
    if (role === "enfermagem") {
      // Exames 3 é sempre Fono
      if (salaNorm.includes("exame 3")) setEncTipo("fono");
      else if (salaNorm.includes("exame 1") || salaNorm.includes("exame 2")) setEncTipo("exame");
      else setEncTipo("medico");
      setEncFromSalaExame(inferredSala);
    } else {
      setEncTipo("medico");
      setEncFromSalaExame("");
    }
    loadDoctors();
    setEncOpen(true);
  }

  async function submitEncaminhar(e: React.FormEvent) {
    e.preventDefault();
    if (!encSenha) return;

    // regras do fluxo:
    // - médico: pode encaminhar para outro médico OU para enfermagem/fono (como exame)
    // - enfermagem: pode encaminhar para médico/fono OU para sala de exame 3
    // - fono: encaminha de volta para médico (consulta)
    if (role !== "medico") {
      if (role === "enfermagem" && (encTipo === "exame" || encTipo === "fono")) {
        // enfermagem:
        // - Exames (1/2) fica na enfermagem
        // - Exames 3 é sempre Fono
        const defaultSala =
          encFromSalaExame === "Sala de exame 1"
            ? "Sala de exame 2"
            : encFromSalaExame === "Sala de exame 2"
              ? "Sala de exame 1"
              : "Sala de exame 2";
        const sala = encTipo === "fono" ? "Sala de exame 3" : salaExame || defaultSala;
        if (encTipo !== "fono" && encFromSalaExame && sala === encFromSalaExame) return;
        await apiFetch("/atendimento/encaminhar", {
          method: "POST",
          body: JSON.stringify({ senha: encSenha, tipo: "exame", salaDestino: sala, motivo: encMotivo || null })
        });
      } else {
        // enfermagem/fono: encaminhar para médico/fono
        if (!doctorId) return;
        await apiFetch("/atendimento/encaminhar", {
          method: "POST",
          body: JSON.stringify({ senha: encSenha, tipo: "medico", medicoDestinoId: doctorId, motivo: encMotivo || null })
        });
      }
      setEncOpen(false);
      await load();
      return;
    }

    if (encTipo === "medico") {
      if (!doctorId) return;
      await apiFetch("/atendimento/encaminhar", {
        method: "POST",
        body: JSON.stringify({ senha: encSenha, tipo: "medico", medicoDestinoId: doctorId, motivo: encMotivo || null })
      });
    } else if (encTipo === "enfermagem") {
      const sala = salaExame || "Sala de exame 1";
      await apiFetch("/atendimento/encaminhar", {
        method: "POST",
        body: JSON.stringify({ senha: encSenha, tipo: "exame", salaDestino: sala, motivo: encMotivo || null })
      });
    } else {
      const sala = "Sala de exame 3";
      await apiFetch("/atendimento/encaminhar", {
        method: "POST",
        body: JSON.stringify({ senha: encSenha, tipo: "exame", salaDestino: sala, motivo: encMotivo || null })
      });
    }

    setEncOpen(false);
    await load();
  }

  function logout() {
    clearSession();
    window.location.href = "/login";
  }

  return (
    <div className="font-['Inter',sans-serif] bg-gradient-to-br from-blue-500 to-blue-700 min-h-screen flex flex-col relative overflow-x-hidden">
      <LegacyBackground variant="app" />

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
            <i className="fas fa-user-md text-2xl" />
            <span className="hidden md:inline">Safe Atendimento</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 py-2 px-4 bg-white/10 rounded-lg font-medium">
            <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center font-semibold text-sm">
              {(user?.nome || "MD").slice(0, 2).toUpperCase()}
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
              <i className={role === "medico" ? "fas fa-user-md text-3xl text-white" : "fas fa-vials text-3xl text-white"} />
            </div>
            <div className="text-5xl font-bold text-blue-500 mb-3 text-center tracking-wide drop-shadow-lg">
              {role === "medico" ? "Painel de Atendimento" : "Painel de Exames"}
            </div>
            <div className="text-base text-gray-500 font-medium">
              {localLabel} • gerencie sua fila em tempo real
            </div>
          </div>

          {error ? <div className="bg-red-100 text-red-800 py-3 px-4 rounded-lg mb-5 text-sm">{error}</div> : null}

          <div className="w-full flex flex-col gap-5">
            {loading ? (
              <div className="text-gray-600 text-center">Carregando…</div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 px-5 text-gray-500">
                <i className="fas fa-inbox text-5xl mb-4 text-gray-300" />
                <h3 className="text-2xl font-semibold mb-2 text-gray-700">Nenhum paciente na fila</h3>
                <p className="text-base text-gray-500">Os pacientes aparecerão aqui quando estiverem aguardando</p>
              </div>
            ) : (
              rows.map((r) => (
                (() => {
                  const enc = normalizeEncaminhamento(r.encaminhamento);
                  const taken = Boolean(r.medico_atendendo_id);

                  // Regra de habilitar o botão "Chamar" por perfil/local:
                  let canCall = false;
                  let canCallReason = "";

                  if (r.status !== "pendente") {
                    canCall = false;
                    canCallReason = "Não está pendente";
                  } else if ((role === "medico" || role === "fono") && hasMyActiveAttendance) {
                    // Regra pedida: médico/fono só pode chamar 1 por vez.
                    canCall = false;
                    canCallReason = "Finalize/encaminhe o atendimento atual antes de chamar outro";
                  } else if (taken) {
                    canCall = false;
                    canCallReason = "Já foi chamado";
                  } else if (role === "medico") {
                    if (isEncaminhamentoExame(enc)) {
                      canCall = false;
                      canCallReason = "Encaminhado para exames";
                    } else {
                      const destinoId = enc?.medicoDestinoId || null;
                      if (destinoId && myId && String(destinoId) !== String(myId)) {
                        canCall = false;
                        canCallReason = "Encaminhado para outro médico";
                      } else {
                        canCall = true;
                      }
                    }
                  } else if (role === "enfermagem") {
                    if (!isEncaminhamentoExame(enc)) {
                      canCall = false;
                      canCallReason = "Consultório (não é exame)";
                    } else if (!matchesExamRoom(enc)) {
                      canCall = false;
                      canCallReason = "Exame de outra sala";
                    } else {
                      canCall = true;
                    }
                  } else if (role === "fono") {
                    if (!isEncaminhamentoExame(enc)) {
                      canCall = false;
                      canCallReason = "Consultório (não é exame)";
                    } else if (!matchesExamRoom(enc)) {
                      canCall = false;
                      canCallReason = "Exame de outra sala";
                    } else {
                      canCall = true;
                    }
                  }

                  const queueTag = (() => {
                    if (r.status !== "pendente") return null;
                    if (!enc) return "Consultório";
                    if (isEncaminhamentoExame(enc)) return String(enc?.salaDestino || localLabel || "Exames");
                    return "Consultório";
                  })();

                  return (
                <div
                  key={r.senha}
                  className="relative overflow-hidden bg-white rounded-2xl py-5 px-6 flex items-center justify-between text-2xl font-semibold shadow-md text-blue-500 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl md:flex-row flex-col gap-3 text-center md:text-left"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-700" />
                  <div>
                    <div className="text-3xl font-black text-blue-500">{senhaCurta(r.senha) || r.senha}</div>
                    <div className="text-xl font-medium text-gray-800">{r.nome || "Sem nome"}</div>
                    {queueTag ? <div className="text-sm text-gray-500 font-medium mt-1">Destino: {queueTag}</div> : null}
                  </div>
                  <div className="flex gap-3">
                    {r.status === "pendente" ? (
                      <button
                        className="bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none"
                        onClick={() => chamar(r.senha)}
                        disabled={!canCall}
                        title={!canCall ? canCallReason : "Chamar"}
                      >
                        Chamar
                      </button>
                    ) : null}
                    {r.status === "em_atendimento" ? (
                      <>
                        <button
                          className="bg-gradient-to-br from-orange-500 to-orange-700 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-orange-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-orange-500/40"
                          onClick={() => openEncaminhar(r)}
                          disabled={!myId || String(r.medico_atendendo_id || "") !== String(myId)}
                        >
                          Encaminhar
                        </button>
                        <button
                          className="bg-gradient-to-br from-green-500 to-green-600 text-white border-none rounded-xl py-3 px-6 text-lg font-bold cursor-pointer transition-all duration-300 shadow-lg shadow-green-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-green-500/40"
                          onClick={() => finalizar(r.senha)}
                          disabled={!myId || String(r.medico_atendendo_id || "") !== String(myId)}
                        >
                          Finalizar
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                  );
                })()
              ))
            )}
          </div>
        </div>
      </div>

      {encOpen ? (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-lg flex items-center justify-center z-[1000] p-6">
          <div className="bg-white rounded-3xl p-0 max-w-[600px] w-[90%] shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white p-6 flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-xl">
                <i className="fas fa-arrow-right" />
              </div>
              <div className="flex-1">
                <h3 className="m-0 text-2xl font-bold">Encaminhar Paciente</h3>
                <p className="m-0 mt-1 text-sm opacity-90">Senha: {encSenha}</p>
              </div>
              <button
                className="bg-white/10 border-none text-white text-lg cursor-pointer p-2 rounded-lg transition-all duration-300 ml-auto hover:bg-white/20"
                onClick={() => setEncOpen(false)}
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <form className="p-6" onSubmit={submitEncaminhar}>
              {role === "medico" ? (
                <div className="mb-5">
                  <label className="flex items-center gap-2 font-semibold text-gray-800 mb-2 text-sm">
                    <i className="fas fa-route text-blue-500 w-4" /> Tipo de Encaminhamento
                  </label>
                  <select
                    className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    value={encTipo}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setEncTipo(v);
                      if (v === "fono") setSalaExame("Sala de exame 3");
                      if (v === "enfermagem" && !salaExame) setSalaExame("Sala de exame 1");
                    }}
                  >
                    <option value="medico">Outro médico</option>
                    <option value="enfermagem">Enfermagem (Exames 1 e 2)</option>
                    <option value="fono">Fono (Exames 3)</option>
                  </select>
                </div>
              ) : role === "enfermagem" ? (
                <div className="mb-5">
                  <label className="flex items-center gap-2 font-semibold text-gray-800 mb-2 text-sm">
                    <i className="fas fa-route text-blue-500 w-4" /> Tipo de Encaminhamento
                  </label>
                  <select
                    className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    value={encTipo}
                    onChange={(e) => {
                      const v = e.target.value as any;
                      setEncTipo(v);
                      if (v === "fono") setSalaExame("Sala de exame 3");
                      if (v === "exame" && !salaExame) setSalaExame("Sala de exame 1");
                    }}
                  >
                    <option value="medico">Médico / Fono</option>
                    <option value="exame">Enfermagem (Exames 1 e 2)</option>
                    <option value="fono">Fono (Exames 3)</option>
                  </select>
                  <div className="mt-2 text-xs text-gray-600">
                    Você está em <strong>{localLabel}</strong>.
                  </div>
                </div>
              ) : (
                <div className="mb-5 text-sm text-gray-700">
                  Você está em <strong>{localLabel}</strong>. Encaminhamento disponível: <strong>voltar para médico</strong>.
                </div>
              )}

              {/* Médico de destino (quando encaminha para médico) */}
              {encTipo === "medico" ? (
                <div className="mb-5">
                  <label className="flex items-center gap-2 font-semibold text-gray-800 mb-2 text-sm">
                    <i className="fas fa-user-md text-blue-500 w-4" /> Destino (Médico / Fono)
                  </label>
                  <select
                    className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    required
                  >
                    <option value="">Selecione o destino</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {String(d.role || "").toLowerCase() === "fono" ? `Fono - ${d.nome}` : d.nome}
                        {d.specialty ? ` - ${d.specialty}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Sala de exame (quando encaminha para exames) */}
              {(role === "medico" && encTipo !== "medico") || (role === "enfermagem" && (encTipo === "exame" || encTipo === "fono")) ? (
                <div className="mb-5">
                  <label className="flex items-center gap-2 font-semibold text-gray-800 mb-2 text-sm">
                    <i className="fas fa-vials text-blue-500 w-4" /> Sala de Exame
                  </label>
                  {encTipo === "fono" ? (
                    <input
                      className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base bg-gray-100"
                      value="Sala de exame 3"
                      readOnly
                    />
                  ) : role === "enfermagem" && encTipo === "exame" ? (
                    <select
                      className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      value={salaExame}
                      onChange={(e) => setSalaExame(e.target.value)}
                      required
                    >
                      <option value="">Selecione</option>
                      {encFromSalaExame !== "Sala de exame 1" ? <option value="Sala de exame 1">Sala de exame 1</option> : null}
                      {encFromSalaExame !== "Sala de exame 2" ? <option value="Sala de exame 2">Sala de exame 2</option> : null}
                    </select>
                  ) : (
                    <select
                      className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                      value={salaExame}
                      onChange={(e) => setSalaExame(e.target.value)}
                      required
                    >
                      <option value="">Selecione</option>
                      <option value="Sala de exame 1">Sala de exame 1</option>
                      <option value="Sala de exame 2">Sala de exame 2</option>
                    </select>
                  )}
                </div>
              ) : null}

              <div className="mb-5">
                <label className="flex items-center gap-2 font-semibold text-gray-800 mb-2 text-sm">
                  <i className="fas fa-comment-dots text-blue-500 w-4" /> Motivo (opcional)
                </label>
                <textarea
                  className="w-full py-3 px-4 border-2 border-gray-200 rounded-xl text-base transition-all duration-300 bg-gray-50 focus:outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
                  rows={3}
                  value={encMotivo}
                  onChange={(e) => setEncMotivo(e.target.value)}
                  placeholder="Descreva o motivo do encaminhamento..."
                />
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  className="py-3 px-6 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-300 border-none bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100"
                  onClick={() => setEncOpen(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="py-3 px-6 rounded-lg text-sm font-semibold cursor-pointer transition-all duration-300 border-none bg-gradient-to-r from-blue-500 to-blue-700 text-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-blue-500/30"
                >
                  <i className="fas fa-save mr-2" />
                  Encaminhar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

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

