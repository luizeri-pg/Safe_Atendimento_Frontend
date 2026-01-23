import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apps/backend/src -> repo root
const REPO_ROOT = path.join(__dirname, "..", "..", "..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });

export const env = {
  PORT: Number(process.env.PORT || 3000),
  SUPABASE_URL: String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
  SUPABASE_ANON_KEY: String(process.env.SUPABASE_ANON_KEY || "").trim(),
  SUPABASE_SERVICE_ROLE_KEY: String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  SAFE_SUPABASE_AUTH_DOMAIN: String(process.env.SAFE_SUPABASE_AUTH_DOMAIN || "safe.local").trim() || "safe.local",
  SAFE_CORS_ORIGIN: String(process.env.SAFE_CORS_ORIGIN || "").trim(),
  SAFE_PUBLIC_DISPLAY_TOKEN: String(process.env.SAFE_PUBLIC_DISPLAY_TOKEN || "").trim(),
  SOC_EXPORT_URL: String(process.env.SOC_EXPORT_URL || "https://ws1.soc.com.br/WebSoc/exportadados").trim(),
  SOC_TIMEZONE: String(process.env.SOC_TIMEZONE || "America/Sao_Paulo").trim(),
  SOC_EMPRESA: String(process.env.SOC_EMPRESA || "").trim(),
  SOC_CODIGO: String(process.env.SOC_CODIGO || "").trim(),
  SOC_CHAVE: String(process.env.SOC_CHAVE || "").trim(),
  SOC_CODIGO_USUARIO_AGENDA: String(process.env.SOC_CODIGO_USUARIO_AGENDA || "").trim()
};

export function getCorsOrigins(): string[] {
  return env.SAFE_CORS_ORIGIN
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

