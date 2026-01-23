export function senhaCurta(raw: unknown): string {
  const s = String(raw || "").trim();
  if (!s) return "";

  const hasPrefix = /^[A-Za-z]/.test(s);
  const prefix = hasPrefix ? s[0].toUpperCase() : "";
  const rest = hasPrefix ? s.slice(1) : s;
  const digits = rest.replace(/\D/g, "");
  if (!digits) return s;

  const first5 = digits.slice(0, 5);
  return prefix ? `${prefix}${first5}` : first5;
}

