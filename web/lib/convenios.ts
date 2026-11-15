// Regras puras do faturamento de convênios (sem acesso a dados): usadas pela camada local e pela nuvem.
import type { BillingBatch, BillingBatchStatus, BillingItem, BillingItemStatus, Db, Insurer, Treatment } from "./types";
import { normName } from "./convenios-presets";

export const BATCH_STATUS_LABEL: Record<BillingBatchStatus, string> = {
  draft: "Rascunho", sent: "Enviado", paid: "Pago", partial: "Pago em parte", glossed: "Glosado",
};
export const ITEM_STATUS_LABEL: Record<BillingItemStatus, string> = {
  pending: "Aguardando", paid: "Pago", partial: "Pago em parte", glossed: "Glosado",
};

export const procedureKey = (procedureId: string | undefined, name: string) => procedureId || normName(name);

/** Status do item a partir dos valores (centavos). */
export function itemStatus(billed: number, paid: number, gloss: number): BillingItemStatus {
  if (paid === 0 && gloss === 0) return "pending";
  if (paid === 0) return "glossed";
  return paid === billed && gloss === 0 ? "paid" : "partial";
}

/** Status do lote: rascunho até o envio; depois depende dos itens. */
export function batchStatus(sentOn: string | undefined, items: Pick<BillingItem, "status">[]): BillingBatchStatus {
  if (!sentOn) return "draft";
  if (!items.length || items.every((i) => i.status === "pending")) return "sent";
  if (items.every((i) => i.status === "paid")) return "paid";
  if (items.every((i) => i.status === "glossed")) return "glossed";
  return "partial";
}

export function batchTotals(items: BillingItem[]) {
  const billed = items.reduce((s, i) => s + i.billedCents, 0);
  const paid = items.reduce((s, i) => s + i.paidCents, 0);
  const gloss = items.reduce((s, i) => s + i.glossCents, 0);
  return { billed, paid, gloss, open: Math.max(0, billed - paid - gloss) };
}

export function monthEnd(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
}

/** Previsão de pagamento: data de envio + prazo do convênio. */
export function expectedPayment(sentOn: string, paymentDays: number) {
  const d = new Date(sentOn + "T12:00:00");
  d.setDate(d.getDate() + paymentDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Valor de repasse do convênio para o atendimento; sem tabela, usa o preço do atendimento. */
export function insurerPriceFor(db: Db, insurerId: string, t: Pick<Treatment, "procedureId" | "procedureName" | "priceCents">) {
  const key = procedureKey(t.procedureId, t.procedureName);
  const hit = db.insurerPrices.find((p) => p.insurerId === insurerId && (p.procedureKey === key || p.procedureKey === normName(t.procedureName)));
  return hit ? hit.priceCents : t.priceCents;
}

/** Atendimentos de pacientes do convênio, concluídos até o fim da competência e ainda fora de qualquer lote. */
export function eligibleTreatments(db: Db, insurerId: string, year: number, month: number): Treatment[] {
  const end = monthEnd(year, month);
  const used = new Set(db.billingItems.map((i) => i.treatmentId).filter(Boolean));
  const mine = new Set(db.patients.filter((p) => p.insurerId === insurerId).map((p) => p.id));
  return db.treatments
    .filter((t) => mine.has(t.patientId) && t.clinicalStatus === "done" && t.performedAt <= end && !used.has(t.id))
    .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
}

/** Monta os itens de um lote a partir de atendimentos. */
export function itemsFromTreatments(db: Db, insurer: Insurer, treatments: Treatment[], professionalName?: string): Omit<BillingItem, "id" | "batchId">[] {
  return treatments.map((t) => {
    const p = db.patients.find((x) => x.id === t.patientId);
    return {
      treatmentId: t.id, patientId: t.patientId, cardNumber: p?.insuranceCard, procedureName: t.procedureName,
      professionalName, performedAt: t.performedAt, billedCents: insurerPriceFor(db, insurer.id, t),
      paidCents: 0, glossCents: 0, status: "pending" as const,
    };
  });
}

const csvCell = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** CSV do lote (separador ponto e vírgula, valores em reais com vírgula), pronto para o Excel em português. */
export function batchCsv(db: Db, batch: BillingBatch): string {
  const ins = db.insurers.find((i) => i.id === batch.insurerId);
  const reais = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const head = ["Convênio", "Competência", "Protocolo", "Paciente", "Carteirinha", "Data", "Procedimento", "Dentista", "Faturado", "Pago", "Glosa", "Motivo da glosa", "Situação"];
  const rows = db.billingItems.filter((i) => i.batchId === batch.id).map((i) => [
    ins?.name, `${String(batch.month).padStart(2, "0")}/${batch.year}`, batch.protocol, db.patients.find((p) => p.id === i.patientId)?.fullName,
    i.cardNumber, i.performedAt.split("-").reverse().join("/"), i.procedureName, i.professionalName, reais(i.billedCents), reais(i.paidCents), reais(i.glossCents),
    i.glossReason, ITEM_STATUS_LABEL[i.status],
  ]);
  return "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}

/** Autoteste leve das regras de status (chamado só em desenvolvimento). */
export function selfCheck() {
  console.assert(itemStatus(1000, 0, 0) === "pending" && itemStatus(1000, 1000, 0) === "paid" && itemStatus(1000, 0, 1000) === "glossed" && itemStatus(1000, 600, 400) === "partial", "itemStatus");
  console.assert(batchStatus(undefined, []) === "draft" && batchStatus("2026-01-01", [{ status: "paid" }, { status: "glossed" }]) === "partial", "batchStatus");
}

export interface InsurerInput {
  id?: string; name: string; type: Insurer["type"]; ansCode?: string; active: boolean; paymentDays: number; closingDay: number;
  defaultGlossPercent: number; contact?: string; notes?: string; suggested?: boolean;
}

/** Valida e limpa o cadastro do convênio (mesmos limites do banco). */
export function normalizeInsurer(f: InsurerInput): Omit<Insurer, "id"> {
  const name = f.name.trim();
  if (!name || name.length > 80) throw new Error("O nome do convênio precisa ter de 1 a 80 caracteres.");
  const int = (n: number, lo: number, hi: number, msg: string) => { if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(msg); return n; };
  const paymentDays = int(f.paymentDays, 0, 365, "O prazo de pagamento vai de 0 a 365 dias.");
  const closingDay = int(f.closingDay, 1, 31, "O dia de fechamento vai de 1 a 31.");
  if (!(f.defaultGlossPercent >= 0 && f.defaultGlossPercent <= 100)) throw new Error("A glosa padrão vai de 0 a 100%.");
  return {
    name, type: f.type, ansCode: f.ansCode?.trim() || undefined, active: f.active, paymentDays, closingDay,
    defaultGlossPercent: f.defaultGlossPercent, contact: f.contact?.trim().slice(0, 200) || undefined, notes: f.notes?.trim().slice(0, 1000) || undefined,
    suggested: f.suggested || undefined,
  };
}

/** Confere pago e glosa de um item: inteiros, sem negativo, somando no máximo o faturado. Glosa exige motivo. */
export function checkItemAmounts(billed: number, paid: number, gloss: number, reason?: string) {
  if (![paid, gloss].every((n) => Number.isInteger(n) && n >= 0)) throw new Error("Os valores precisam ser positivos.");
  if (paid + gloss > billed) throw new Error("Pago mais glosa não pode passar do valor faturado.");
  if (gloss > 0 && !reason?.trim()) throw new Error("Informe o motivo da glosa.");
}
