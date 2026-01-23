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
  const [soundMode, setSoundMode] = useState<"campainha" | "forte" | "medio" | "clinico">(() => {
    try {
      const v = String(localStorage.getItem("SAFE_DISPLAY_SOUND_MODE") || "").trim();
      if (v === "campainha" || v === "forte" || v === "medio" || v === "clinico") return v;
      return "campainha";
    } catch {
      return "campainha";
    }
  });
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("SAFE_DISPLAY_SOUND") === "1";
    } catch {
      return false;
    }
  });
  const [soundStatus, setSoundStatus] = useState<"off" | "ready" | "blocked">("off");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastBeepAtRef = useRef<number>(0);

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

  function playClinicChime(ctx: AudioContext) {
    const now = ctx.currentTime;
    const note1Hz = 880; // "ding"
    const note2Hz = 660; // "dong"
    const note1Dur = 0.16;
    const gap = 0.06;
    const note2Dur = 0.20;

    const out = withOutputChain(ctx);
    // Suaviza o timbre para ficar mais “painel”.
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2400, now);
    filter.Q.setValueAtTime(0.7, now);
    filter.connect(out.destination);

    const makeNote = (startAt: number, freq: number, dur: number) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.connect(filter);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startAt);
      osc.connect(gain);

      // Attack rápido + decay suave
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    };

    makeNote(now, note1Hz, note1Dur);
    makeNote(now + note1Dur + gap, note2Hz, note2Dur);

    // Cleanup do filtro no final
    const endAt = now + note1Dur + gap + note2Dur + 0.04;
    setTimeout(() => {
      try {
        filter.disconnect();
        out.cleanup();
      } catch {
        // ignore
      }
    }, Math.max(0, Math.ceil((endAt - ctx.currentTime) * 1000)));
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

  function playMediumAlert(ctx: AudioContext) {
    const now = ctx.currentTime;
    const out = withOutputChain(ctx);

    const makePing = (startAt: number, freq: number, dur: number, vol: number) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.connect(out.destination);

      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, startAt);
      osc.connect(gain);

      gain.gain.exponentialRampToValueAtTime(vol, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    };

    // "BI-BI" mais evidente (médio)
    makePing(now, 1100, 0.13, 0.35);
    makePing(now + 0.20, 1100, 0.13, 0.35);

    const endAt = now + 0.45;
    setTimeout(() => out.cleanup(), Math.max(0, Math.ceil((endAt - ctx.currentTime) * 1000)));
  }

  function playStrongAlert(ctx: AudioContext) {
    const now = ctx.currentTime;
    const out = withOutputChain(ctx);

    // "ALARME" chamativo: 3 bips curtos + burst leve de ruído (tipo atenção).
    const makeBeep = (startAt: number, freq: number, dur: number) => {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.connect(out.destination);

      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, startAt);
      osc.connect(gain);

      gain.gain.exponentialRampToValueAtTime(0.55, startAt + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);

      osc.start(startAt);
      osc.stop(startAt + dur + 0.02);

      osc.onended = () => {
        try {
          osc.disconnect();
          gain.disconnect();
        } catch {
          // ignore
        }
      };
    };

    const freqs = [1200, 950, 1200];
    const starts = [now, now + 0.18, now + 0.36];
    for (let i = 0; i < 3; i++) makeBeep(starts[i]!, freqs[i]!, 0.12);

    // Ruído curtíssimo para chamar atenção (bem controlado pelo compressor)
    const noiseDur = 0.08;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now + 0.01);
    noiseGain.gain.exponentialRampToValueAtTime(0.20, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02 + noiseDur);
    noise.connect(noiseGain);
    noiseGain.connect(out.destination);
    noise.start(now + 0.01);
    noise.stop(now + 0.01 + noiseDur + 0.02);
    noise.onended = () => {
      try {
        noise.disconnect();
        noiseGain.disconnect();
      } catch {
        // ignore
      }
    };

    const endAt = now + 0.60;
    setTimeout(() => out.cleanup(), Math.max(0, Math.ceil((endAt - ctx.currentTime) * 1000)));
  }

  function playNotification(ctx: AudioContext) {
    if (soundMode === "campainha") return playDoorbell(ctx);
    if (soundMode === "forte") return playStrongAlert(ctx);
    if (soundMode === "medio") return playMediumAlert(ctx);
    return playClinicChime(ctx);
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
      localStorage.removeItem("SAFE_DISPLAY_SOUND");
    } catch {
      // ignore
    }
  }

  function saveSoundMode(next: "campainha" | "forte" | "medio" | "clinico") {
    setSoundMode(next);
    try {
      localStorage.setItem("SAFE_DISPLAY_SOUND_MODE", next);
    } catch {
      // ignore
    }
  }

  async function testSound() {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state !== "running") await ctx.resume();
      setSoundEnabled(true);
      setSoundStatus(ctx.state === "running" ? "ready" : "blocked");
      try {
        localStorage.setItem("SAFE_DISPLAY_SOUND", "1");
      } catch {
        // ignore
      }
      if (ctx.state === "running") playNotification(ctx);
    } catch {
      setSoundStatus("blocked");
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
    const onQueue = () => load().catch(() => null);
    const onQueueEvent = () => {
      beepTwice();
      onQueue();
    };
    const onAnn = (payload: any) => {
      const senha = String(payload?.senha || "").trim();
      if (!senha) return;
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
    socket.on("queue_update", onQueueEvent);
    socket.on("public_announcement", onAnn);
    return () => {
      socket.off("queue_update", onQueueEvent);
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
          <select
            className="bg-white/10 hover:bg-white/20 rounded-xl px-3 py-2 transition text-white text-sm outline-none"
            value={soundMode}
            onChange={(e) => saveSoundMode(e.target.value as any)}
            title="Tipo de som"
          >
            <option value="campainha">Campainha</option>
            <option value="forte">Alerta forte</option>
            <option value="medio">Alerta médio</option>
            <option value="clinico">Clínico</option>
          </select>
          <button className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition" onClick={testSound} title="Testar som">
            <i className="fas fa-bell mr-2" />
            Testar
          </button>
          <button className="bg-white/10 hover:bg-white/20 rounded-xl px-4 py-2 transition" onClick={() => load()}>
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

