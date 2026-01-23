export type SafeRole = "atendente" | "medico" | "enfermagem" | "fono" | "admin" | "painel" | "public_display";

export type Profile = {
  id: string;
  username: string;
  nome: string;
  role: string;
  crm?: string | null;
  specialty?: string | null;
};

export type QueueUpdateEvent = {
  reason: string;
  senha?: string;
  ts: string;
};

export type AlertReceptionEvent = {
  cpf: string;
  senha: string;
  ts: string;
};

export type PublicAnnouncementEvent = {
  senha: string;
  nome?: string | null;
  sala?: string | null;
  reason?: string;
  ts: string;
};

