export function senhaCurta(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";

  const hasPrefix = /^[A-Za-z]/.test(s);
  const prefix = hasPrefix ? s[0].toUpperCase() : "";
  const rest = hasPrefix ? s.slice(1) : s;
  const digits = rest.replace(/\D/g, "");
  if (!digits) return s;

  // Importante: não usar os primeiros dígitos porque o formato atual começa com data (ex.: 26012...),
  // o que fazia várias senhas aparecerem iguais no painel. Usamos os ÚLTIMOS 5 dígitos (parte variável).
  const last5 = digits.length <= 5 ? digits : digits.slice(-5);
  return prefix ? `${prefix}${last5}` : last5;
}

