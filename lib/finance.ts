import type { Db } from "./types";

/** Recebido = atendimentos com pagamento recebido, pela data do atendimento. */
export function monthSummary(db: Db, ym: string) {
  const received = db.treatments.filter((t) => t.paymentStatus === "received" && t.performedAt.startsWith(ym)).reduce((s, t) => s + t.priceCents, 0);
  const spent = db.expenses.filter((e) => e.spentAt.startsWith(ym)).reduce((s, e) => s + e.amountCents, 0);
  const receivable = db.treatments.filter((t) => t.paymentStatus === "pending").reduce((s, t) => s + t.priceCents, 0);
  return { received, spent, balance: received - spent, receivable };
}

export function lastMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
