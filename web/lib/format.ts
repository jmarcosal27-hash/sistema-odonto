const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "1 consulta" / "3 consultas": número com a palavra no singular ou plural. */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const money = (cents: number) => brl.format(cents / 100);

export function parseMoney(input: string): number | undefined {
  const clean = input.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (!clean) return undefined;
  const n = Number(clean);
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
}

export const todayISO = () => toISODate(new Date());

/** A consulta ainda não começou? Compara data e hora (sem hora definida, vale o dia inteiro). */
export function notStarted(a: { date: string; time?: string }, now = new Date()) {
  const t = toISODate(now);
  if (a.date !== t) return a.date > t;
  return !a.time || a.time >= now.toTimeString().slice(0, 5);
}

export function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISODate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, days: number) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export const daysBetween = (a: string, b: string) =>
  Math.round((fromISODate(b).getTime() - fromISODate(a).getTime()) / 86400000);

export function dateLong(iso: string) {
  return fromISODate(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
}

export function dateShort(iso: string) {
  return fromISODate(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
}

export function dateBR(iso?: string) {
  if (!iso) return "—";
  const d = iso.length > 10 ? new Date(iso) : fromISODate(iso);
  return d.toLocaleDateString("pt-BR");
}

export function age(birth?: string) {
  if (!birth) return undefined;
  const b = fromISODate(birth);
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskCep(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function isValidCpf(v: string) {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function whatsappLink(phone: string | undefined, text: string) {
  const d = (phone ?? "").replace(/\D/g, "");
  const full = d.length <= 11 ? `55${d}` : d;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Topo "redondo" de escala de gráfico (1, 2 ou 5 × 10^n reais), em centavos. */
export const niceMaxCents = (peakCents: number) => {
  const r = Math.max(1, peakCents) / 100; const p = 10 ** Math.floor(Math.log10(r));
  return ([1, 2, 5, 10].find((k) => k * p >= r) ?? 10) * p * 100;
};
/** Valor curto para eixo de gráfico: "R$ 2,5 mil", "R$ 800". */
export const moneyShort = (cents: number) => { const r = cents / 100; return r >= 1000 ? `R$ ${(r / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : `R$ ${Math.round(r)}`; };

/** Saudação a partir do nome profissional: "Dra. Ana Oliveira" → "Dra. Ana"; "Ana Oliveira" → "Ana". */
export function greetingName(full?: string) {
  const w = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "";
  const t = w[0].replace(/\.$/, "").toLowerCase();
  const title = t === "dr" ? "Dr." : t === "dra" ? "Dra." : "";
  const given = title ? w[1] : w[0];
  return title ? (given ? `${title} ${given}` : "") : given;
}
