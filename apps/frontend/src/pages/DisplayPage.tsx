import { useEffect, useMemo, useRef, useState } from "react";
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
  prioridade?: boolean | null;
  prioridade_at?: string | null;
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
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("SAFE_DISPLAY_SOUND");
      // Padrão: ligado (para painel/TV). Se o usuário desligar, gravamos "0".
      if (v === "0") return false;
      if (v === "1") return true;
      return true;
    } catch {
      return true;
    }
  });
  const [soundStatus, setSoundStatus] = useState<"off" | "ready" | "blocked">("off");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastBeepAtRef = useRef<number>(0);
  const didAutoEnableRef = useRef<boolean>(false);

  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && typeof ctx.close === "function") {
        try {
          void ctx.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  function getOrCreateAudioContext() {
    if (typeof window === "undefined") return null;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctx) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  }

  function withOutputChain(ctx: AudioContext) {
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-20, ctx.currentTime);
    compressor.knee.setValueAtTime(20, ctx.currentTime);
    compressor.ratio.setValueAtTime(6, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.12, ctx.currentTime);
    compressor.connect(ctx.destination);
    return {
      destination: compressor,
      cleanup: () => {
        try {
          compressor.disconnect();
        } catch {
          // ignore
        }
      }
    };
  }

  function playDoorbell(ctx: AudioContext) {
    const now = ctx.currentTime;
    const out = withOutputChain(ctx);

    // Campainha "ding-dong": parcials + decay longo (mais parecido com campainha real).
    const makeBellNote = (startAt: number, baseHz: number, dur: number, vol: number) => {
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(Math.min(3200, baseHz * 3), startAt);
      filter.Q.setValueAtTime(0.9, startAt);
      filter.connect(out.destination);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.connect(filter);

      const partials = [
        { mul: 1, amp: 1.0 },
        { mul: 2.01, amp: 0.55 },
        { mul: 3.12, amp: 0.35 },
        { mul: 4.23, amp: 0.22 }
      ];

      const oscillators: OscillatorNode[] = [];
      for (const p of partials) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(baseHz * p.mul, startAt);
        osc.connect(gain);
        oscillators.push(osc);
      }

      // Attack rápido + decay longo
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      for (const osc of oscillators) osc.start(startAt);
      for (const osc of oscillators) osc.stop(startAt + dur + 0.03);

      const endAt = startAt + dur + 0.04;
      setTimeout(() => {
        try {
          for (const osc of oscillators) osc.disconnect();
          gain.disconnect();
          filter.disconnect();
        } catch {
          // ignore
        }
      }, Math.max(0, Math.ceil((endAt - ctx.currentTime) * 1000)));
    };

    // ding (mais agudo) + dong (mais grave)
    makeBellNote(now, 988, 0.55, 0.38); // ~B5
    makeBellNote(now + 0.38, 659, 0.65, 0.42); // ~E5

    const endAt = now + 1.2;
    setTimeout(() => out.cleanup(), Math.max(0, Math.ceil((endAt - ctx.currentTime) * 1000)));
  }

  function playNotification(ctx: AudioContext) {
    // Mantemos apenas a campainha (mais chamativa).
    return playDoorbell(ctx);
  }

  function beepTwice() {
    if (!soundEnabled) return;
    // Evita bip duplicado quando vários eventos chegam juntos (ex.: queue_update + public_announcement).
    const nowMs = Date.now();
    if (nowMs - lastBeepAtRef.current < 700) return;
    lastBeepAtRef.current = nowMs;

    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state !== "running") {
      setSoundStatus("blocked");
      // Tenta resumir (em alguns browsers funciona após o primeiro clique).
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === "running") {
            setSoundStatus("ready");
            playNotification(ctx);
          }
        })
        .catch(() => null);
      return;
    }

    playNotification(ctx);
  }

  async function enableSound() {
    try {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state !== "running") await ctx.resume();
      setSoundEnabled(true);
      setSoundStatus(ctx.state === "running" ? "ready" : "blocked");
      try {
        localStorage.setItem("SAFE_DISPLAY_SOUND", "1");
      } catch {
        // ignore
      }
    } catch {
      setSoundStatus("blocked");
    }
  }

  function disableSound() {
    setSoundEnabled(false);
    setSoundStatus("off");
    try {
      localStorage.setItem("SAFE_DISPLAY_SOUND", "0");
    } catch {
      // ignore
    }
  }

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

  // Tenta habilitar automaticamente ao abrir.
  useEffect(() => {
    if (!soundEnabled) return;
    if (didAutoEnableRef.current) return;
    didAutoEnableRef.current = true;
    // Se o navegador permitir autoplay, isso já deixa pronto.
    // Se não permitir, o painel vai mostrar o aviso (blocked) para o usuário clicar 1x.
    enableSound().catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!soundEnabled) {
      setSoundStatus("off");
      return;
    }
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    setSoundStatus(ctx.state === "running" ? "ready" : "blocked");
  }, [soundEnabled]);

  useEffect(() => {
    const onQueue = () => {
      // Som em toda atualização de fila/lista (triagem/finalizar/chamar/encaminhar/etc).
      beepTwice();
      load().catch(() => null);
    };
    const onAnn = (payload: any) => {
      const senha = String(payload?.senha || "").trim();
      if (!senha) return;
      // Como este evento também aciona atualização de tela (highlight + reload),
      // tocamos a campainha aqui também. O debounce evita duplicar se vier junto com queue_update.
      beepTwice();
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
          <button
            className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition"
            onClick={() => (soundEnabled ? disableSound() : enableSound())}
            title={soundEnabled ? "Desativar som" : "Ativar som"}
          >
            <i className={soundEnabled ? "fas fa-volume-up mr-2" : "fas fa-volume-mute mr-2"} />
            {soundEnabled ? "Som: ON" : "Som: OFF"}
          </button>
          <button
            className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition"
            onClick={() => {
              beepTwice();
              load().catch(() => null);
            }}
          >
            <i className="fas fa-sync-alt mr-2" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-start justify-center py-10 px-5 relative z-10">
        <div className="w-full max-w-[1400px]">
          {lastError ? <div className="mb-4 bg-red-100 text-red-800 py-3 px-4 rounded-lg text-sm">{lastError}</div> : null}
          {soundEnabled && soundStatus === "blocked" ? (
            <div className="mb-4 bg-yellow-100 text-yellow-900 py-3 px-4 rounded-lg text-sm flex items-center justify-between gap-3">
              <div>
                Som ativado, mas o navegador bloqueou o áudio automático. Clique em <strong>Ativar som</strong> para liberar.
              </div>
              <button className="bg-yellow-900/10 hover:bg-yellow-900/20 rounded-xl px-4 py-2 transition" onClick={enableSound}>
                Ativar som
              </button>
            </div>
          ) : null}

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
                        <div className="text-4xl font-black text-blue-600 flex items-center gap-3 flex-wrap">
                          <span>{senhaCurta(s.senha) || s.senha}</span>
                          {s.prioridade ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold bg-red-100 text-red-800 border border-red-200">
                              PRIORITÁRIO
                            </span>
                          ) : null}
                        </div>
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

