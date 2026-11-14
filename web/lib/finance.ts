import type { Db } from "./types";
import { todayISO, toISODate } from "./format";

/** Dia local (não UTC) de um instante ISO: evita contar de madrugada no dia errado. */
const localDay = (iso: string) => toISODate(new Date(iso));

const inPeriod = (date: string | undefined, from: string, to: string) => !!date && date >= from && date <= to;

export function periodFor(kind: "month" | "30d" | "year", ref = todayISO()): [string, string, string] {
  const [y, m] = ref.split("-");
  if (kind === "year") return [`${y}-01-01`, `${y}-12-31`, `Ano de ${y}`];
  if (kind === "30d") {
    const d = new Date(); d.setDate(d.getDate() - 29);
    return [toISODate(d), ref, "Últimos 30 dias"];
  }
  const last = new Date(Number(y), Number(m), 0).getDate();
  return [`${y}-${m}-01`, `${y}-${m}-${last}`, "Este mês"];
}

/** Dinheiro que entrou: atendimentos avulsos recebidos + parcelas pagas. */
export function received(db: Db, from: string, to: string) {
  const loose = db.treatments.filter((t) => t.paymentStatus === "received" && inPeriod(t.performedAt, from, to)).reduce((s, t) => s + t.priceCents, 0);
  const inst = db.installments.filter((i) => inPeriod(i.paidAt, from, to)).reduce((s, i) => s + i.amountCents, 0);
  return loose + inst;
}

/** Faturado: valor dos tratamentos realizados (concluídos) no período, já com o desconto do orçamento de origem. */
export function billed(db: Db, from: string, to: string) {
  // O desconto do orçamento é proporcional aos itens aprovados, então vale o mesmo fator para cada item.
  const factor = new Map(db.budgets.map((b) => [b.id, b.subtotalCents ? b.totalCents / b.subtotalCents : 1]));
  return db.treatments
    .filter((t) => t.clinicalStatus === "done" && inPeriod(t.performedAt, from, to))
    .reduce((s, t) => s + Math.round(t.priceCents * (t.budgetId ? factor.get(t.budgetId) ?? 1 : 1)), 0);
}

export function receivable(db: Db) {
  const loose = db.treatments.filter((t) => t.paymentStatus === "pending").reduce((s, t) => s + t.priceCents, 0);
  const inst = db.installments.filter((i) => !i.paidAt).reduce((s, i) => s + i.amountCents, 0);
  return loose + inst;
}

export function overdue(db: Db) {
  const t = todayISO();
  return db.installments.filter((i) => !i.paidAt && i.dueDate < t);
}

export function monthSummary(db: Db, ym: string) {
  const last = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const from = `${ym}-01`, to = `${ym}-${last}`;
  const rec = received(db, from, to);
  const exp = db.expenses.filter((e) => e.spentAt.startsWith(ym));
  const spent = exp.reduce((s, e) => s + e.amountCents, 0);
  const paidOut = exp.filter((e) => e.paid !== false).reduce((s, e) => s + e.amountCents, 0);
  return { received: rec, spent, paidOut, toPay: spent - paidOut, balance: rec - spent, receivable: receivable(db) };
}

export function indicators(db: Db, from: string, to: string) {
  const rec = received(db, from, to);
  const payers = new Set([
    ...db.treatments.filter((t) => t.paymentStatus === "received" && inPeriod(t.performedAt, from, to)).map((t) => t.patientId),
    ...db.installments.filter((i) => inPeriod(i.paidAt, from, to)).map((i) => i.patientId),
  ]);
  const appts = db.appointments.filter((a) => a.patientId && inPeriod(a.date, from, to) && a.date <= todayISO());
  const done = appts.filter((a) => a.status === "done").length;
  const noShow = appts.filter((a) => a.status === "no_show").length;
  const budgets = db.budgets.filter((b) => inPeriod(localDay(b.presentedAt), from, to));
  const decided = budgets.filter((b) => b.status !== "presented");
  const overdueSum = overdue(db).reduce((s, i) => s + i.amountCents, 0);
  return {
    billed: billed(db, from, to),
    received: rec,
    avgPerPayer: payers.size ? Math.round(rec / payers.size) : null,
    overdue: overdueSum,
    noShowRate: done + noShow ? noShow / (done + noShow) : null,
    conversion: decided.length ? budgets.filter((b) => b.status === "authorized").length / decided.length : null,
    budgetsCount: budgets.length,
    visits: done,
    newPatients: db.patients.filter((p) => inPeriod(localDay(p.createdAt), from, to)).length,
  };
}

export function lastMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
}
