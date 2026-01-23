import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env, getCorsOrigins } from "./env.js";
import { supabaseAuthUser, supabaseFetchProfile } from "./supabase.js";
import type { AlertReceptionEvent, PublicAnnouncementEvent, QueueUpdateEvent, SafeRole } from "./types.js";

export type SocketContext = {
  io: Server;
  emitQueueUpdate: (reason: string, senha?: string) => void;
  emitAlertReception: (cpf: string, senha: string) => void;
  emitPublicAnnouncement: (senha: string, nome?: string | null, sala?: string | null, reason?: string) => void;
};

function normalizeRole(role: unknown): SafeRole {
  const r = String(role || "").trim().toLowerCase();
  if (r === "atendente") return "atendente";
  if (r === "medico") return "medico";
  if (r === "enfermagem") return "enfermagem";
  if (r === "fono") return "fono";
  if (r === "admin") return "admin";
  if (r === "painel") return "painel";
  return "public_display";
}

export function attachSocket(httpServer: HttpServer): SocketContext {
  const corsOrigins = getCorsOrigins();
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins.length ? corsOrigins : true,
      credentials: false
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = String((socket.handshake as any)?.auth?.token || "").trim();
      const publicToken = String((socket.handshake as any)?.auth?.publicToken || "").trim();

      if (!token) {
        // Painel público: se SAFE_PUBLIC_DISPLAY_TOKEN estiver configurado, exige match.
        // Se não estiver configurado, permite conexão pública como "public_display".
        if (!env.SAFE_PUBLIC_DISPLAY_TOKEN) {
          (socket.data as any).role = "public_display";
          return next();
        }
        if (publicToken && publicToken === env.SAFE_PUBLIC_DISPLAY_TOKEN) {
          (socket.data as any).role = "public_display";
          return next();
        }
        return next(new Error("unauthorized"));
      }

      const userOut = await supabaseAuthUser({ accessToken: token });
      if (!userOut.ok) return next(new Error("unauthorized"));

      const userId = String(userOut.json?.id || "").trim();
      if (!userId) return next(new Error("unauthorized"));

      const profOut = await supabaseFetchProfile({ accessToken: token, userId });
      if (!profOut.ok) return next(new Error("unauthorized"));

      (socket.data as any).userId = userId;
      (socket.data as any).profile = profOut.profile;
      (socket.data as any).role = normalizeRole(profOut.profile?.role);
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const role = normalizeRole((socket.data as any)?.role);
    socket.join(`role:${role}`);

    // perfis de atendimento também entram em uma sala genérica
    if (role === "medico" || role === "enfermagem" || role === "fono") {
      socket.join("role:atendimento");
    }
    if (role === "atendente") socket.join("role:reception");
    if (role === "public_display") socket.join("role:painel");
  });

  function emitQueueUpdate(reason: string, senha?: string) {
    const payload: QueueUpdateEvent = { reason, senha, ts: new Date().toISOString() };
    io.to(["role:reception", "role:atendimento", "role:painel", "role:admin"]).emit("queue_update", payload);
  }

  function emitAlertReception(cpf: string, senha: string) {
    const payload: AlertReceptionEvent = { cpf, senha, ts: new Date().toISOString() };
    io.to(["role:reception", "role:atendente"]).emit("alert_reception", payload);
  }

  function emitPublicAnnouncement(senha: string, nome?: string | null, sala?: string | null, reason?: string) {
    const payload: PublicAnnouncementEvent = {
      senha,
      nome: nome ?? null,
      sala: sala ?? null,
      reason: reason || undefined,
      ts: new Date().toISOString()
    };
    io.to(["role:painel"]).emit("public_announcement", payload);
  }

  return { io, emitQueueUpdate, emitAlertReception, emitPublicAnnouncement };
}

