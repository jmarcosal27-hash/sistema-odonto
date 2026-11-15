// Controle de prótese: regras puras compartilhadas pelas duas camadas de dados e pelas telas.
// No modo nuvem as mesmas validações e o histórico vivem no banco (migration 20261116000003_protese.sql).

import type { Db, Laboratory, ProsthesisEvent, ProsthesisJob, ProsthesisKind, ProsthesisStage } from "./types";
import { uid } from "./format";

export const STAGES: { id: ProsthesisStage; name: string }[] = [
  { id: "pre_lab", name: "Pré-laboratório" },
  { id: "sent", name: "Envio" },
  { id: "lab", name: "Laboratório" },
  { id: "scheduled", name: "Agenda" },
  { id: "done", name: "Realizado" },
];
export const stageName = (s: ProsthesisStage) => STAGES.find((x) => x.id === s)?.name ?? s;

export const KINDS: { id: ProsthesisKind; name: string }[] = [
  { id: "crown", name: "Coroa" }, { id: "total", name: "Prótese total" }, { id: "ppr", name: "PPR (removível parcial)" },
  { id: "veneer", name: "Faceta" }, { id: "protocol", name: "Protocolo" }, { id: "splint", name: "Placa" }, { id: "other", name: "Outro" },
];
export const kindName = (k: ProsthesisKind) => KINDS.find((x) => x.id === k)?.name ?? k;

/** Colunas em que a data prevista vencida conta como atraso. */
const LATE_STAGES: ProsthesisStage[] = ["sent", "lab"];

/** Atrasado = está em Envio ou Laboratório e a data prevista de retorno já passou (hoje ainda não é atraso). */
export const isOverdue = (j: ProsthesisJob, today: string) => LATE_STAGES.includes(j.stage) && !!j.dueOn && j.dueOn < today;

export interface JobInput {
  patientId: string; professional: string; description: string; kind: ProsthesisKind;
  teeth?: string; shade?: string; laboratoryId?: string; sentOn?: string; dueOn?: string; costCents?: number;
  notes?: string; label?: string; isReturn?: boolean; returnReason?: string;
}

const text = (v: string | undefined, max: number, name: string) => {
  const t = v?.trim() || undefined;
  if (t && t.length > max) throw new Error(`${name}: até ${max} caracteres.`);
  return t;
};
const date = (v: string | undefined, name: string) => {
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${name}: data inválida.`);
  return v;
};

/** Valida e limpa os campos de um serviço. Mesmos limites das constraints do banco. */
export function normalizeJob(i: JobInput) {
  if (!i.patientId) throw new Error("Escolha o paciente.");
  const professional = text(i.professional, 120, "Profissional");
  if (!professional) throw new Error("Informe o profissional.");
  const description = text(i.description, 255, "Descrição do serviço");
  if (!description) throw new Error("Descreva o serviço.");
  if (!KINDS.some((k) => k.id === i.kind)) throw new Error("Tipo de serviço inválido.");
  if (i.costCents !== undefined && (!Number.isInteger(i.costCents) || i.costCents < 0)) throw new Error("Informe um valor válido.");
  const isReturn = !!i.isReturn;
  const returnReason = text(i.returnReason, 255, "Motivo do retorno");
  if (isReturn && !returnReason) throw new Error("Informe o motivo do retorno.");
  const sentOn = date(i.sentOn, "Data de envio"), dueOn = date(i.dueOn, "Data prevista");
  if (sentOn && dueOn && dueOn < sentOn) throw new Error("A data prevista não pode ser antes do envio.");
  return {
    patientId: i.patientId, professional, description, kind: i.kind, teeth: text(i.teeth, 60, "Dente(s) ou região"), shade: text(i.shade, 40, "Cor ou escala"),
    laboratoryId: i.laboratoryId || undefined, sentOn, dueOn, costCents: i.costCents, notes: text(i.notes, 500, "Observações"), label: text(i.label, 30, "Rótulo"),
    isReturn, returnReason: isReturn ? returnReason : undefined,
  };
}

export function normalizeLab(i: { name: string; phone?: string; notes?: string }): Omit<Laboratory, "id"> {
  const name = text(i.name, 80, "Nome");
  if (!name) throw new Error("Dê um nome ao laboratório.");
  return { name, phone: text(i.phone, 30, "Telefone"), notes: text(i.notes, 255, "Observação") };
}

export function addProsthesisEvent(db: Db, jobId: string, kind: ProsthesisEvent["kind"], body: string, authorName?: string) {
  db.prosthesisEvents.push({ id: uid(), jobId, kind, body, authorName, createdAt: new Date().toISOString() });
}

/** Move o serviço e registra no histórico. Não faz nada se ele já está na etapa. */
export function moveProsthesis(db: Db, job: ProsthesisJob, stage: ProsthesisStage, authorName?: string) {
  if (job.stage === stage) return;
  if (!STAGES.some((s) => s.id === stage)) throw new Error("Etapa não encontrada.");
  const from = stageName(job.stage);
  const now = new Date().toISOString();
  job.stage = stage;
  job.stageChangedAt = now;
  job.updatedAt = now;
  addProsthesisEvent(db, job.id, "stage", `${from} → ${stageName(stage)}`, authorName);
}
