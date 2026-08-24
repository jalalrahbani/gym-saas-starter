export function formatMoney(minor: number | string | null | undefined, currency = "USD") {
  const numeric = typeof minor === "string" ? Number(minor) : (minor ?? 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(numeric / 100);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateTime(value: string | null | undefined, timezone?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", ...(timezone ? { timeZone: timezone } : {}) }).format(new Date(value));
}

export function memberDisplayNumber(value: number | string) {
  return `M-${String(value).padStart(5, "0")}`;
}

export function durationBetween(start: string, end: string | null) {
  if (!end) return "Inside";
  const minutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return hours ? `${hours}h ${rem}m` : `${rem}m`;
}
