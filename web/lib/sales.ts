// Funil de vendas: regras puras compartilhadas pelas duas camadas de dados e pelas telas.
// No modo nuvem as mesmas regras de criação e movimentação automática vivem no banco
// (migration 20261116000002_vendas.sql); aqui ficam a versão da demonstração e os cálculos de tela.

import type { Budget, Db, Opportunity, OpportunityEvent, SalesStage, SalesStageKind } from "./types";
import { toISODate, uid } from "./format";

export const STAGE_NAMES: Record<SalesStageKind, string> = { open: "Em aberto", in_progress: "Em andamento", won: "Ganha", lost: "Perdida" };
const KINDS: SalesStageKind[] = ["open", "in_progress", "won", "lost"];

/** Ids fixos na demonstração; na nuvem cada clínica tem os seus (use sempre `kind` para achar a etapa). */
export const defaultStages = (): SalesStage[] => KINDS.map((kind, position) => ({ id: `stage-${kind}`, name: STAGE_NAMES[kind], position, kind }));

export const sortedStages = (db: Db) => [...db.salesStages].sort((a, b) => a.position - b.position);
export const stageOfKind = (db: Db, kind: SalesStageKind) => db.salesStages.find((s) => s.kind === kind);

/** Etapa em que a oportunidade de um orçamento deve estar: aprovado = Ganha, recusado = Perdida. */
export const budgetStageKind = (status: Budget["status"]): SalesStageKind => (status === "authorized" ? "won" : status === "declined" ? "lost" : "open");

export function pushEvent(db: Db, opportunityId: string, kind: OpportunityEvent["kind"], body: string, authorName?: string) {
  db.opportunityEvents.push({ id: uid(), opportunityId, kind, body, authorName, createdAt: new Date().toISOString() });
}

/** Move a oportunidade e registra no histórico. Não faz nada se ela já está na etapa. */
export function moveOpportunity(db: Db, opp: Opportunity, stageId: string, authorName?: string) {
  if (opp.stageId === stageId) return;
  const from = db.salesStages.find((s) => s.id === opp.stageId)?.name ?? "—";
  const to = db.salesStages.find((s) => s.id === stageId)?.name ?? "—";
  const now = new Date().toISOString();
  opp.stageId = stageId;
  opp.stageChangedAt = now;
  opp.updatedAt = now;
  pushEvent(db, opp.id, "stage", `${from} → ${to}`, authorName);
}

/** Cria (ou move) a oportunidade ligada ao orçamento, como o gatilho do banco faz na nuvem. */
export function syncBudgetOpportunity(db: Db, b: Budget, authorName?: string) {
  const stage = stageOfKind(db, budgetStageKind(b.status));
  if (!stage) return;
  const existing = db.opportunities.find((o) => o.budgetId === b.id);
  if (existing) { moveOpportunity(db, existing, stage.id, authorName); return; }
  const at = b.status === "presented" ? b.presentedAt : (b.authorizedAt ?? b.presentedAt);
  const opp: Opportunity = {
    id: uid(), patientId: b.patientId, stageId: stage.id, budgetId: b.id, title: "Orçamento de tratamento", valueCents: b.totalCents,
    responsible: authorName, createdAt: b.presentedAt, updatedAt: at, stageChangedAt: at,
  };
  db.opportunities.push(opp);
  pushEvent(db, opp.id, "system", "Criou esta oportunidade", authorName);
}

/** Completa dados antigos e de demonstração: etapas padrão e uma oportunidade para cada orçamento. */
export function backfillSales(db: Db) {
  db.salesStages ??= []; db.opportunities ??= []; db.opportunityEvents ??= []; db.salesGoals ??= {};
  for (const d of defaultStages()) if (!stageOfKind(db, d.kind!)) db.salesStages.push(d);
  for (const b of db.budgets) if (!db.opportunities.some((o) => o.budgetId === b.id)) syncBudgetOpportunity(db, b);
}

export interface GoalProgress { month: string; goalCents: number; soldCents: number; missingCents: number; businessDaysLeft: number; daysLeft: number; perBusinessDayCents: number }

/**
 * Vendido no mês = orçamentos aprovados no mês (soma das parcelas, que já refletem aprovação parcial e desconto)
 * + oportunidades ganhas no mês que não vêm de orçamento.
 * Dias restantes e dias úteis (segunda a sexta, sem feriados) contam o dia de hoje.
 */
export function goalProgress(db: Db, now = new Date()): GoalProgress {
  const month = toISODate(now).slice(0, 7);
  const inMonth = (iso: string) => toISODate(new Date(iso)).slice(0, 7) === month;
  let sold = 0;
  for (const b of db.budgets) {
    if (b.status !== "authorized" || !b.authorizedAt || !inMonth(b.authorizedAt)) continue;
    const parts = db.installments.filter((i) => i.budgetId === b.id);
    sold += parts.length ? parts.reduce((s, i) => s + i.amountCents, 0) : b.totalCents;
  }
  const won = stageOfKind(db, "won");
  for (const o of db.opportunities) if (!o.budgetId && won && o.stageId === won.id && inMonth(o.stageChangedAt)) sold += o.valueCents;
  const goal = db.salesGoals[month] ?? 0;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let biz = 0;
  for (let d = now.getDate(); d <= last; d++) { const w = new Date(now.getFullYear(), now.getMonth(), d).getDay(); if (w !== 0 && w !== 6) biz++; }
  const missing = Math.max(goal - sold, 0);
  return { month, goalCents: goal, soldCents: sold, missingCents: missing, businessDaysLeft: biz, daysLeft: last - now.getDate() + 1, perBusinessDayCents: biz ? Math.ceil(missing / biz) : missing };
}
