import type { CashMethod, CommissionRule, Db } from "./types";

/**
 * Caixa: lê dos dados que já existem (parcelas pagas, atendimentos recebidos, despesas pagas) e soma os lançamentos
 * manuais. Nada é lançado duas vezes. Estornado = fica na lista, mas não entra em nenhuma soma.
 */
export type CashSource = "installment" | "treatment" | "expense" | "movement";

export interface CashEntry {
  key: string;
  kind: "in" | "out";
  date: string;
  amountCents: number;
  method?: CashMethod;
  category: string;
  description?: string;
  patientId?: string;
  professionalId?: string;
  procedure?: string;
  /** Parcela de orçamento com vários procedimentos: o valor dividido entre eles, proporcional ao preço de cada um. */
  parts?: { procedure: string; amountCents: number }[];
  source: CashSource;
  sourceId: string;
  reversed: boolean;
  reversalReason?: string;
}

export const CASH_METHODS: { id: CashMethod; label: string }[] = [
  { id: "cash", label: "Dinheiro" }, { id: "pix", label: "Pix" }, { id: "debit", label: "Cartão de débito" }, { id: "credit", label: "Cartão de crédito" },
  { id: "boleto", label: "Boleto" }, { id: "transfer", label: "Transferência" }, { id: "insurance", label: "Convênio" }, { id: "other", label: "Outro" },
];
export const methodLabel = (m?: CashMethod) => CASH_METHODS.find((x) => x.id === m)?.label ?? "—";
export const IN_CATEGORIES = ["Outras entradas", "Aporte do sócio", "Troco inicial"];
export const OUT_CATEGORIES = ["Retirada", "Sangria", "Material", "Laboratório", "Aluguel", "Outras saídas"];

/** Dentista que atendeu o paciente: o último agendamento concluído até a data do recebimento. */
function inferProfessional(db: Db, patientId: string, date: string) {
  const list = db.appointments.filter((a) => a.patientId === patientId && a.professionalId && a.date <= date && a.status !== "cancelled" && a.status !== "no_show");
  list.sort((a, b) => (a.status === "done" ? 0 : 1) - (b.status === "done" ? 0 : 1) || b.date.localeCompare(a.date));
  return list[0]?.professionalId;
}

/**
 * Divide `total` centavos na proporção dos pesos, sem perder nem sobrar centavo (maiores restos ficam com o centavo extra).
 * Pesos todos zero: divide por igual.
 */
export function splitProportional(total: number, weights: number[]): number[] {
  if (!weights.length) return [];
  const sum = weights.reduce((s, w) => s + w, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const den = sum > 0 ? sum : weights.length;
  const raw = w.map((x) => (total * x) / den);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((s, x) => s + x, 0);
  const order = raw.map((x, k) => [x - Math.floor(x), k] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let j = 0; rest > 0; j = (j + 1) % order.length, rest--) out[order[j][1]]++;
  return out;
}

/** Todos os lançamentos do caixa, do mais antigo ao mais novo. */
export function cashLedger(db: Db): CashEntry[] {
  const meta = new Map(db.cashReceipts.map((m) => [`${m.sourceType}:${m.sourceId}`, m]));
  const out: CashEntry[] = [];
  for (const i of db.installments) {
    if (!i.paidAt) continue;
    const m = meta.get(`installment:${i.id}`);
    // Peso de cada procedimento do orçamento = soma dos preços dos atendimentos dele.
    const weight = new Map<string, number>();
    for (const t of db.treatments) if (t.budgetId === i.budgetId) weight.set(t.procedureName, (weight.get(t.procedureName) ?? 0) + Math.max(0, t.priceCents));
    const names = [...weight.keys()];
    const shares = splitProportional(i.amountCents, names.map((n) => weight.get(n) ?? 0));
    out.push({
      key: `installment:${i.id}`, kind: "in", date: i.paidAt, amountCents: i.amountCents, method: m?.method ?? i.method ?? "other",
      category: "Recebimento de paciente", description: `Parcela ${i.number}/${i.of}`, patientId: i.patientId,
      professionalId: m?.professionalId ?? inferProfessional(db, i.patientId, i.paidAt), procedure: names[0], source: "installment", sourceId: i.id,
      parts: names.length > 1 ? names.map((procedure, k) => ({ procedure, amountCents: shares[k] })) : undefined,
      reversed: !!m?.reversedAt, reversalReason: m?.reversalReason,
    });
    if (names.length > 1) out[out.length - 1].description += ` · ${names.join(", ")}`;
  }
  for (const t of db.treatments) {
    if (t.paymentStatus !== "received") continue;
    const m = meta.get(`treatment:${t.id}`);
    out.push({
      key: `treatment:${t.id}`, kind: "in", date: t.performedAt, amountCents: t.priceCents, method: m?.method ?? "other",
      category: "Recebimento de paciente", patientId: t.patientId, professionalId: m?.professionalId ?? inferProfessional(db, t.patientId, t.performedAt),
      procedure: t.procedureName, source: "treatment", sourceId: t.id, reversed: !!m?.reversedAt, reversalReason: m?.reversalReason,
    });
  }
  for (const e of db.expenses) {
    if (e.paid === false) continue;
    out.push({ key: `expense:${e.id}`, kind: "out", date: e.spentAt, amountCents: e.amountCents, category: e.category, description: e.description, source: "expense", sourceId: e.id, reversed: false });
  }
  for (const c of db.cashMovements) {
    out.push({
      key: `movement:${c.id}`, kind: c.kind, date: c.date, amountCents: c.amountCents, method: c.method, category: c.category, description: c.description,
      patientId: c.patientId, professionalId: c.professionalId, source: "movement", sourceId: c.id, reversed: !!c.reversedAt, reversalReason: c.reversalReason,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1) || a.key.localeCompare(b.key));
}

export const signed = (e: CashEntry) => (e.reversed ? 0 : e.kind === "in" ? e.amountCents : -e.amountCents);

/** Saldo, entradas e saídas de um período (inclusive) a partir da lista completa. */
export function cashTotals(all: CashEntry[], from: string, to: string) {
  const opening = all.filter((e) => e.date < from).reduce((s, e) => s + signed(e), 0);
  const inP = all.filter((e) => e.date >= from && e.date <= to && !e.reversed);
  const entradas = inP.filter((e) => e.kind === "in").reduce((s, e) => s + e.amountCents, 0);
  const saidas = inP.filter((e) => e.kind === "out").reduce((s, e) => s + e.amountCents, 0);
  return { opening, entradas, saidas, closing: opening + entradas - saidas };
}

/** Dinheiro em espécie esperado na gaveta no fim do dia: abertura + entradas em dinheiro - saídas em dinheiro. */
export function expectedDrawer(all: CashEntry[], day: string, openingCents: number) {
  return all.filter((e) => e.date === day && !e.reversed && e.method === "cash").reduce((s, e) => s + (e.kind === "in" ? e.amountCents : -e.amountCents), openingCents);
}

/** Regra do dentista para o procedimento: a específica, senão a padrão (procedureKey ""). */
export function ruleFor(rules: CommissionRule[], professionalId: string, procedure?: string): CommissionRule | undefined {
  const mine = rules.filter((r) => r.professionalId === professionalId);
  const key = (procedure ?? "").trim().toLowerCase();
  return (key && mine.find((r) => r.procedureKey.trim().toLowerCase() === key)) || mine.find((r) => r.procedureKey === "");
}

/** Comissão de um recebimento: (valor - % de custo) x % do dentista. Centavos inteiros. */
export function commissionCents(amountCents: number, rule: { percent: number; labCostPercent: number }) {
  return Math.round(amountCents * (1 - rule.labCostPercent / 100) * (rule.percent / 100));
}

export interface CommissionPart { procedure?: string; amountCents: number; cents: number; percent: number; labCostPercent: number }
export interface CommissionLine {
  entry: CashEntry; professionalId: string; cents: number; percent: number; labCostPercent: number; paid: boolean;
  /** Mais de um procedimento com regras diferentes: a comissão é a soma das partes. */
  parts?: CommissionPart[];
}

/**
 * Recebimentos do período com dentista e regra: comissão devida, pendente ou paga. Estornados ficam de fora.
 * Parcela de orçamento com vários procedimentos: cada parte (proporcional ao preço) usa a regra do seu procedimento.
 */
export function commissionLines(db: Db, from: string, to: string): CommissionLine[] {
  const paid = new Set(db.commissionPayouts.flatMap((p) => p.items.map((i) => `${i.sourceType}:${i.sourceId}`)));
  const lines: CommissionLine[] = [];
  for (const e of cashLedger(db)) {
    if (e.kind !== "in" || e.reversed || e.source === "movement" || e.source === "expense" || !e.professionalId || e.date < from || e.date > to) continue;
    const pro = e.professionalId;
    const parts: CommissionPart[] = (e.parts ?? [{ procedure: e.procedure, amountCents: e.amountCents }]).flatMap((p) => {
      const rule = ruleFor(db.commissionRules, pro, p.procedure);
      if (!rule || rule.percent <= 0) return [];
      return [{ procedure: p.procedure, amountCents: p.amountCents, cents: commissionCents(p.amountCents, rule), percent: rule.percent, labCostPercent: rule.labCostPercent }];
    });
    if (!parts.length) continue;
    const same = parts.every((p) => p.percent === parts[0].percent && p.labCostPercent === parts[0].labCostPercent) && parts.length === (e.parts?.length ?? 1);
    // Mesma regra em tudo: calcula sobre o valor inteiro (bate com a conta mostrada na tela, sem centavo de arredondamento).
    const cents = same ? commissionCents(e.amountCents, parts[0]) : parts.reduce((s, p) => s + p.cents, 0);
    lines.push({ entry: e, professionalId: pro, cents, percent: parts[0].percent, labCostPercent: parts[0].labCostPercent, paid: paid.has(e.key),
      parts: same ? undefined : parts });
  }
  return lines;
}

/** Valida lançamento manual do caixa (mesma regra nos dois modos). */
export function checkMovement(m: { amountCents: number; category: string; date: string }) {
  if (!Number.isInteger(m.amountCents) || m.amountCents <= 0) return "Informe um valor maior que zero.";
  if (!m.category.trim()) return "Escolha a categoria.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.date)) return "Data inválida.";
  return null;
}
export function checkRule(r: { percent: number; labCostPercent: number }) {
  const ok = (n: number) => Number.isFinite(n) && n >= 0 && n <= 100 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  return ok(r.percent) && ok(r.labCostPercent) ? null : "Percentual de 0 a 100, com até 2 casas.";
}

const csvCell = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** CSV do período (separador ; para abrir direto no Excel em português). Valores em reais. */
export function cashCsv(db: Db, entries: CashEntry[]) {
  const pat = new Map(db.patients.map((p) => [p.id, p.fullName]));
  const pro = new Map(db.professionals.map((p) => [p.id, p.name]));
  const head = ["Data", "Tipo", "Valor", "Forma", "Categoria", "Paciente", "Procedimento", "Dentista", "Descrição", "Situação"];
  const rows = entries.map((e) => [
    e.date, e.kind === "in" ? "Entrada" : "Saída", ((e.kind === "in" ? 1 : -1) * e.amountCents / 100).toFixed(2).replace(".", ","), methodLabel(e.method), e.category,
    e.patientId ? pat.get(e.patientId) : "", e.procedure, e.professionalId ? pro.get(e.professionalId) : "", e.description, e.reversed ? `Estornado: ${e.reversalReason ?? ""}` : "Válido",
  ].map(csvCell).join(";"));
  return "﻿" + [head.map(csvCell).join(";"), ...rows].join("\r\n");
}
