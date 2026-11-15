"use client";

// Camada de dados FALSA (localStorage). As funções de `api` têm a mesma forma
// das server actions planejadas em replica/architecture.md, para que o
// replica-backend troque a implementação sem mexer no código das telas.

import { useSyncExternalStore } from "react";
import type {
  AnamnesisAnswer, AnamnesisQuestion, Certificate, ClinicalNote, CustomDocument, Medication, Prescription, PrescriptionItem, PrescriptionTemplate,
  Appointment, Db, Expense, Installment, Patient, PatientEvent, PaymentMethod, PlanItem,
  Procedure, Profile, RecallStatus, CashMethod, CashMovement, CommissionPayoutItem, CommissionRule, Treatment, TreatmentPlan, MessageTemplate, WaitlistEntry, Opportunity, ProsthesisJob, Professional,
} from "./types";
import { MAX_COMMENT } from "./types";
import { addProsthesisEvent, moveProsthesis, normalizeJob, normalizeLab, type JobInput } from "./prosthesis";
import { backfillSales,defaultStages, moveOpportunity, pushEvent, sortedStages, stageOfKind, syncBudgetOpportunity } from "./sales";
import { BASE_PROCEDURES, DEFAULT_ACTIVE_SPECIALTIES, hasUnanswered } from "./catalog";
import { addDays, todayISO, uid } from "./format";
import { MAX_BLOCK_DAYS, prepareAppointment, toMin } from "./agenda";
import { checkHofItem } from "./hof";
import { checkMovement, checkRule } from "./cash";
import { batchCashed, batchStatus, checkItemAmounts, itemStatus, itemsFromTreatments, expectedPayment, normalizeInsurer, eligibleTreatments, type InsurerInput } from "./convenios";
import { normName } from "./convenios-presets";
import { buildSeed } from "./seed";
import { MAX_DEMO_FILE_BYTES, checkFile, readAsDataUrl } from "./files";
import { REMOTE, supabaseBrowser } from "./supabase/client";
import { loadRemote, makeRemoteApi, type RemoteState } from "./remote";

const KEY = "consultorio-db-v1";
const VERSION = 12;
const listeners = new Set<() => void>();
let cache: Db | null = null;

export function emptyDb(): Db {
  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(now.getFullYear() + 1);
  return {
    version: VERSION,
    patients: [], events: [], customProcedures: [], prices: {}, plans: [],
    budgets: [], treatments: [], expenses: [], appointments: [],
    installments: [], waitlist: [], recall: {}, recallMonths: {},
    clinicalNotes: [], anamnesisTemplates: [], anamnesisRecords: [],
    medications: [], prescriptions: [], prescriptionTemplates: [], certificates: [], customDocuments: [], patientFiles: [],
    salesStages: defaultStages(), opportunities: [], opportunityEvents: [], salesGoals: {},
    laboratories: [], prosthesisJobs: [], prosthesisEvents: [], professionals: [], timeBlocks: [],
    cashMovements: [], cashReceipts: [], cashDays: [], commissionRules: [], commissionPayouts: [],
    insurers: [], insurerPrices: [], billingBatches: [], billingItems: [],
    templates: [
      { kind: "confirmation", body: "Olá, {nome}! Passando para confirmar seu horário em {data} às {hora}. Pode responder com SIM para confirmar? 😊" },
      { kind: "recall", body: "Oi, {nome}! Já está na hora da sua revisão. Quer que eu reserve um horário para você nesta semana?" },
    ],
    profile: { workMode: "solo", theme: "system", activeSpecialtyIds: DEFAULT_ACTIVE_SPECIALTIES, onboardingDone: false },
    access: { plan: "Anual", startsAt: now.toISOString(), expiresAt: expires.toISOString(), email: "voce@exemplo.com" },
  };
}

/** Completa dados salvos por versões anteriores do app. */
function migrate(db: Db): Db {
  if (db.version >= VERSION) return db;
  db.installments ??= [];
  db.waitlist ??= [];
  db.recall ??= {};
  db.recallMonths ??= {};
  db.clinicalNotes ??= [];
  db.anamnesisTemplates ??= [];
  db.anamnesisRecords ??= [];
  db.medications ??= [];
  db.prescriptions ??= [];
  db.prescriptionTemplates ??= [];
  db.certificates ??= [];
  db.customDocuments ??= [];
  db.patientFiles ??= [];
  // v6: fichas de anamnese antigas passam a concluídas (imutáveis); correção vira revisão
  db.anamnesisRecords.forEach((r) => { if (!r.status) { r.status = "completed"; r.completedAt ??= r.createdAt; } });
  // v7: itens de HOF (campos opcionais em PlanItem); planos e orçamentos antigos seguem como estão, sem perda
  // v8: funil de vendas. Cria as quatro etapas padrão e uma oportunidade para cada orçamento existente (aberto, aprovado ou recusado), sem tocar nos orçamentos.
  backfillSales(db);
  // v9: controle de prótese (laboratórios, serviços e histórico). Começa vazio e não toca em nada que já existe.
  db.laboratories ??= []; db.prosthesisJobs ??= []; db.prosthesisEvents ??= [];
  // v10: agenda por profissional e bloqueios. Começa vazia; agendamentos antigos seguem sem profissional (coluna "Sem profissional") e sem perda.
  db.professionals ??= []; db.timeBlocks ??= [];
  // v11: caixa e comissões. Começam vazios; o caixa lê parcelas pagas, atendimentos recebidos e despesas que já existem.
  db.cashMovements ??= []; db.cashReceipts ??= []; db.cashDays ??= []; db.commissionRules ??= []; db.commissionPayouts ??= [];
  // v12: convênios e faturamento. Começam vazios; pacientes antigos seguem como particulares (sem insurerId).
  db.insurers ??= []; db.insurerPrices ??= []; db.billingBatches ??= []; db.billingItems ??= [];
  db.version = VERSION;
  return db;
}

function load(): Db {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? migrate(JSON.parse(raw) as Db) : buildSeed(emptyDb());
    persist();
  } catch {
    cache = buildSeed(emptyDb());
  }
  return cache!;
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch { /* storage cheio ou bloqueado */ }
}

function commit(mutate: (db: Db) => void) {
  const next = structuredClone(load());
  mutate(next);
  cache = next;
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) { cache = null; l(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

/** null durante SSR / hidratação -> telas mostram skeleton. */
export function useDb(): Db | null {
  return useSyncExternalStore(REMOTE ? subscribeRemote : subscribe, REMOTE ? remoteDb : load, () => null);
}

// ===== modo nuvem =====
let remote: RemoteState = { status: "loading" };
let started = false;
const notify = () => listeners.forEach((l) => l());
async function refreshRemote() {
  try { remote = await loadRemote(); } catch (e) { remote = { status: "error", message: e instanceof Error ? e.message : "Falha ao carregar." }; }
  notify();
}
function subscribeRemote(l: () => void) {
  listeners.add(l);
  if (!started) { started = true; void refreshRemote(); }
  return () => { listeners.delete(l); };
}
const remoteDb = () => (remote.status === "ready" ? remote.db : null);
const remoteState = () => remote;
/** Estado da sessão na nuvem (null no modo demonstração). */
export function useRemoteState(): RemoteState | null {
  return useSyncExternalStore(REMOTE ? subscribeRemote : subscribe, REMOTE ? remoteState : () => null, () => (REMOTE ? { status: "loading" } as RemoteState : null));
}
export const reloadRemote = refreshRemote;

export function isReadOnly(db: Db) {
  return new Date(db.access.expiresAt).getTime() < Date.now();
}

function guard(db: Db) {
  if (isReadOnly(db)) throw new Error("Seu acesso venceu. Seus dados continuam aqui para consulta; renove para voltar a registrar.");
}

const event = (db: Db, patientId: string, kind: PatientEvent["kind"], label: string) =>
  db.events.push({ id: uid(), patientId, kind, label, createdAt: new Date().toISOString() });

export function allProcedures(db: Db): Procedure[] {
  return [...BASE_PROCEDURES, ...db.customProcedures];
}

export const itemTotal = (i: PlanItem) => (i.priceCents ?? 0) * (i.quantity ?? 1);
export const planTotal = (items: PlanItem[]) => items.reduce((s, i) => s + itemTotal(i), 0);

/** Divide `total` em `n` parcelas inteiras; a diferença de arredondamento vai na última. */
export function splitInstallments(total: number, n: number) {
  const base = Math.floor(total / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? total - base * (n - 1) : base));
}

function addMonths(iso: string, m: number) {
  const [y, mo, d] = iso.split("-").map(Number);
  const dt = new Date(y, mo - 1 + m, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
  dt.setDate(Math.min(d, last));
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function touchVisit(db: Db, patientId: string | undefined, date: string) {
  const p = patientId && db.patients.find((x) => x.id === patientId);
  if (p && (!p.lastVisitAt || p.lastVisitAt.slice(0, 10) < date)) p.lastVisitAt = date;
}

export interface PaymentPlan { installments: number; firstDue: string; method?: PaymentMethod; paidNow?: boolean }

const professionalSnapshot = (db: Db) => ({
  professionalName: db.profile.professionalName || undefined,
  professionalCro: db.profile.cro || undefined,
  professionalCroUf: db.profile.croUf || undefined,
});

/** Valida e normaliza os itens de uma receita (mesmas regras dos CHECKs do banco). */
function checkPrescriptionItems(items: Omit<PrescriptionItem, "id" | "medicationId">[]) {
  if (!items.length) throw new Error("Adicione pelo menos um medicamento.");
  if (items.length > 30) throw new Error("No máximo 30 itens por receita.");
  return items.map((it) => {
    const name = it.name.trim(), posology = it.posology.trim();
    if (!name) throw new Error("Todo item precisa de nome.");
    if (!posology) throw new Error(`Informe a posologia de ${name}.`);
    if (it.quantity !== undefined && !(it.quantity > 0)) throw new Error(`A quantidade de ${name} precisa ser maior que zero.`);
    return { ...it, name, posology, unit: it.unit?.trim() || undefined };
  });
}

const localApi = {
  patients: {
    async create(input: Omit<Patient, "id" | "createdAt" | "recallEnabled"> & { recallEnabled?: boolean }) {
      const id = uid();
      commit((db) => {
        guard(db);
        if (input.cpf && db.patients.some((p) => p.cpf === input.cpf)) throw new Error("Já existe um paciente com esse CPF.");
        db.patients.push({ recallEnabled: true, ...input, id, createdAt: new Date().toISOString() });
        event(db, id, "created", "Cadastro criado");
      });
      return id;
    },
    async update(id: string, patch: Partial<Patient>) {
      commit((db) => {
        guard(db);
        const p = db.patients.find((x) => x.id === id);
        if (!p) throw new Error("Paciente não encontrado.");
        Object.assign(p, patch);
      });
    },
    async archive(id: string, archived: boolean) {
      commit((db) => {
        guard(db);
        const p = db.patients.find((x) => x.id === id);
        if (p) p.archived = archived || undefined;
      });
    },
    async importRows(rows: Partial<Patient>[]) {
      let created = 0; const errors: string[] = [];
      commit((db) => {
        guard(db);
        rows.forEach((r, i) => {
          if (!r.fullName?.trim()) { errors.push(`Linha ${i + 2}: sem nome`); return; }
          if (r.cpf && db.patients.some((p) => p.cpf === r.cpf)) { errors.push(`Linha ${i + 2}: CPF já cadastrado`); return; }
          const id = uid();
          db.patients.push({ recallEnabled: true, ...r, fullName: r.fullName.trim(), id, createdAt: new Date().toISOString() } as Patient);
          event(db, id, "created", "Importado de planilha");
          created++;
        });
      });
      return { created, errors };
    },
  },

  plans: {
    async save(plan: Omit<TreatmentPlan, "id" | "createdAt" | "status"> & { id?: string }) {
      const id = plan.id ?? uid();
      plan = { ...plan, items: plan.items.map(checkHofItem) };
      commit((db) => {
        guard(db);
        const existing = db.plans.find((p) => p.id === id);
        if (existing) Object.assign(existing, plan);
        else {
          db.plans.push({ ...plan, id, status: "draft", createdAt: new Date().toISOString() });
          event(db, plan.patientId, "plan_created", "Plano de tratamento montado");
        }
      });
      return id;
    },
    async saveAsBudget(planId: string) {
      const id = uid();
      commit((db) => {
        guard(db);
        const plan = db.plans.find((p) => p.id === planId);
        if (!plan) throw new Error("Plano não encontrado.");
        if (!plan.items.length) throw new Error("Adicione pelo menos um procedimento antes de gerar o orçamento.");
        const subtotal = planTotal(plan.items);
        const discount = Math.min(plan.discountCents ?? 0, subtotal);
        plan.status = "budgeted";
        db.budgets.push({
          id, planId, patientId: plan.patientId, subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount,
          status: "presented", authorizedItemIds: [], presentedAt: new Date().toISOString(),
        });
        event(db, plan.patientId, "budget_presented", "Orçamento apresentado");
        syncBudgetOpportunity(db, db.budgets[db.budgets.length - 1], db.profile.professionalName || undefined);
      });
      return id;
    },
  },

  // atalhos usados pelas telas (o modo nuvem faz numa transação só)
  budgetsFromPlan: {
    async createBudget(plan: Omit<TreatmentPlan, "id" | "createdAt" | "status">) {
      const planId = await localApi.plans.save(plan);
      return localApi.plans.saveAsBudget(planId);
    },
  },

  budgets: {
    /** Valor aprovado: itens escolhidos menos o desconto, proporcional à parte aprovada. */
    approvedTotal(db: Db, budgetId: string, itemIds: string[]) {
      const b = db.budgets.find((x) => x.id === budgetId);
      const plan = b && db.plans.find((p) => p.id === b.planId);
      if (!b || !plan) return 0;
      const subtotal = planTotal(plan.items);
      const chosen = planTotal(plan.items.filter((i) => itemIds.includes(i.id)));
      const discount = b.discountCents ?? 0;
      return subtotal ? chosen - Math.round((discount * chosen) / subtotal) : 0;
    },
    async authorize(budgetId: string, itemIds: string[] | undefined, payment: PaymentPlan) {
      commit((db) => {
        guard(db);
        const b = db.budgets.find((x) => x.id === budgetId);
        const plan = b && db.plans.find((p) => p.id === b.planId);
        if (!b || !plan) throw new Error("Orçamento não encontrado.");
        if (b.status !== "presented") throw new Error("Esse orçamento já foi respondido.");
        const chosen = plan.items.filter((i) => !itemIds || itemIds.includes(i.id));
        if (!chosen.length) throw new Error("Escolha pelo menos um item para aprovar.");
        const n = Math.max(1, Math.min(24, Math.round(payment.installments)));
        const total = api.budgets.approvedTotal(db, budgetId, chosen.map((i) => i.id));
        b.status = "authorized";
        b.authorizedItemIds = chosen.map((i) => i.id);
        b.authorizedAt = new Date().toISOString();
        plan.status = "authorized";
        chosen.forEach((item) => db.treatments.push({
          id: uid(), patientId: b.patientId, budgetId: b.id, planItemId: item.id, procedureId: item.procedureId,
          procedureName: (item.procedureName ?? "Procedimento") + (item.tooth ? ` · dente ${item.tooth}` : item.region ? ` · ${regionLabel(item.region)}` : "") + ((item.quantity ?? 1) > 1 ? ` (×${item.quantity})` : ""),
          performedAt: todayISO(), priceCents: itemTotal(item),
          paymentStatus: "budget", clinicalStatus: "in_progress", createdAt: new Date().toISOString(),
        }));
        splitInstallments(total, n).forEach((amount, i) => db.installments.push({
          id: uid(), budgetId: b.id, patientId: b.patientId, number: i + 1, of: n,
          dueDate: addMonths(payment.firstDue, i), amountCents: amount, method: payment.method,
          paidAt: payment.paidNow && i === 0 ? todayISO() : undefined,
        }));
        event(db, b.patientId, "budget_authorized",
          (chosen.length === plan.items.length ? "Orçamento aprovado" : `Orçamento aprovado em parte (${chosen.length} de ${plan.items.length} itens)`) + (n > 1 ? ` em ${n}x` : ""));
        syncBudgetOpportunity(db, b, db.profile.professionalName || undefined);
      });
    },
    async decline(budgetId: string) {
      commit((db) => {
        guard(db);
        const b = db.budgets.find((x) => x.id === budgetId);
        if (!b) throw new Error("Orçamento não encontrado.");
        if (b.status !== "presented") throw new Error("Esse orçamento já foi respondido.");
        b.status = "declined";
        syncBudgetOpportunity(db, b, db.profile.professionalName || undefined);
      });
    },
  },

  installments: {
    async pay(id: string, method?: PaymentMethod, date = todayISO()) {
      commit((db) => {
        guard(db);
        const i = db.installments.find((x) => x.id === id);
        if (!i) throw new Error("Parcela não encontrada.");
        i.paidAt = date;
        if (method) i.method = method;
        event(db, i.patientId, "payment_received", `Parcela ${i.number}/${i.of} recebida`);
      });
    },
    async unpay(id: string) {
      commit((db) => { guard(db); const i = db.installments.find((x) => x.id === id); if (i) delete i.paidAt; });
    },
  },

  treatments: {
    async log(input: Omit<Treatment, "id" | "createdAt"> & { nextAppointmentDate?: string }) {
      const { nextAppointmentDate, ...t } = input;
      commit((db) => {
        guard(db);
        db.treatments.push({ ...t, id: uid(), createdAt: new Date().toISOString() });
        touchVisit(db, t.patientId, t.performedAt);
        delete db.recall[t.patientId];
        event(db, t.patientId, "treatment_done", `${t.procedureName} realizado`);
        if (t.paymentStatus === "received") event(db, t.patientId, "payment_received", "Pagamento registrado");
        if (nextAppointmentDate) {
          db.appointments.push({ id: uid(), patientId: t.patientId, kind: "return", date: nextAppointmentDate, durationMinutes: 30, status: "to_confirm" });
          event(db, t.patientId, "appointment_scheduled", "Retorno agendado");
        }
      });
    },
    async update(id: string, patch: Partial<Treatment>) {
      commit((db) => {
        guard(db);
        const t = db.treatments.find((x) => x.id === id);
        if (!t) throw new Error("Atendimento não encontrado.");
        const wasPending = t.paymentStatus === "pending";
        Object.assign(t, patch);
        if (patch.clinicalStatus === "done") { touchVisit(db, t.patientId, todayISO()); delete db.recall[t.patientId]; }
        if (wasPending && patch.paymentStatus === "received") event(db, t.patientId, "payment_received", `Recebido: ${t.procedureName}`);
      });
    },
  },

  appointments: {
    async save(input: Omit<Appointment, "id"> & { id?: string }) {
      commit((db) => {
        guard(db);
        const a = prepareAppointment(db, input);
        const existing = a.id && db.appointments.find((x) => x.id === a.id);
        if (existing) Object.assign(existing, a);
        else {
          db.appointments.push({ ...a, id: uid() });
          if (a.patientId) event(db, a.patientId, "appointment_scheduled", "Compromisso marcado");
        }
        if (a.patientId && a.status !== "cancelled" && a.date >= todayISO()) {
          const r = db.recall[a.patientId];
          if (!r || r.status !== "dismissed") db.recall[a.patientId] = { status: "scheduled", dueAt: r?.dueAt ?? a.date, updatedAt: new Date().toISOString() };
          const w = db.waitlist.find((x) => x.patientId === a.patientId && (x.status === "waiting" || x.status === "contacted"));
          if (w) w.status = "placed";
        }
        if (a.status === "done") touchVisit(db, a.patientId, a.date);
      });
    },
    async setStatus(id: string, status: Appointment["status"]) {
      commit((db) => {
        guard(db);
        const a = db.appointments.find((x) => x.id === id);
        if (!a) return;
        a.status = status;
        if (status === "done") touchVisit(db, a.patientId, a.date);
      });
    },
  },

  professionals: {
    async save(p: { id?: string; name: string; color: string; active: boolean }) {
      commit((db) => {
        guard(db);
        const name = p.name.trim();
        if (!name || name.length > 80) throw new Error("O nome do profissional precisa ter de 1 a 80 caracteres.");
        if (!/^#[0-9a-fA-F]{6}$/.test(p.color)) throw new Error("Escolha uma cor para o profissional.");
        if (db.professionals.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) throw new Error("Já existe um profissional com esse nome.");
        const existing = p.id ? db.professionals.find((x) => x.id === p.id) : undefined;
        if (p.id && !existing) throw new Error("Profissional não encontrado.");
        if (existing) Object.assign(existing, { name, color: p.color, active: p.active });
        else db.professionals.push({ id: uid(), name, color: p.color, active: p.active } satisfies Professional);
      });
    },
    /** Os agendamentos do profissional ficam, só sem profissional; os bloqueios dele saem junto. */
    async remove(id: string) {
      commit((db) => {
        guard(db);
        db.professionals = db.professionals.filter((x) => x.id !== id);
        db.appointments.forEach((a) => { if (a.professionalId === id) a.professionalId = undefined; });
        db.timeBlocks = db.timeBlocks.filter((b) => b.professionalId !== id);
      });
    },
  },

  timeBlocks: {
    /** Um bloqueio por dia em `dates`. Sem profissional = clínica toda. */
    async create(b: { professionalId?: string; dates: string[]; startTime: string; endTime: string; reason: string }) {
      commit((db) => {
        guard(db);
        const reason = b.reason.trim() || "Bloqueio";
        if (reason.length > 80) throw new Error("O motivo pode ter até 80 caracteres.");
        if (!b.startTime || !b.endTime || toMin(b.endTime) <= toMin(b.startTime)) throw new Error("O fim precisa ser depois do início.");
        if (!b.dates.length || b.dates.length > MAX_BLOCK_DAYS) throw new Error(`Escolha de 1 a ${MAX_BLOCK_DAYS} dias.`);
        if (b.professionalId && !db.professionals.some((p) => p.id === b.professionalId)) throw new Error("Profissional não encontrado.");
        b.dates.forEach((date) => db.timeBlocks.push({ id: uid(), professionalId: b.professionalId, date, startTime: b.startTime, endTime: b.endTime, reason }));
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.timeBlocks = db.timeBlocks.filter((x) => x.id !== id); }); },
  },

  waitlist: {
    async add(e: Omit<WaitlistEntry, "id" | "createdAt" | "status">) {
      commit((db) => {
        guard(db);
        if (db.waitlist.some((x) => x.patientId === e.patientId && (x.status === "waiting" || x.status === "contacted")))
          throw new Error("Esse paciente já está na lista de espera.");
        db.waitlist.push({ ...e, id: uid(), status: "waiting", createdAt: new Date().toISOString() });
      });
    },
    async setStatus(id: string, status: WaitlistEntry["status"]) {
      commit((db) => { guard(db); const w = db.waitlist.find((x) => x.id === id); if (w) w.status = status; });
    },
  },

  recall: {
    async setStatus(patientId: string, status: RecallStatus, dueAt: string) {
      commit((db) => { guard(db); db.recall[patientId] = { status, dueAt, updatedAt: new Date().toISOString() }; });
    },
  },

  clinicalNotes: {
    async save(n: { id?: string; patientId: string; treatmentId?: string; date: string; body: string }) {
      commit((db) => {
        guard(db);
        const body = n.body.trim();
        if (!body) throw new Error("Escreva a evolução antes de salvar.");
        if (n.treatmentId && !db.treatments.some((t) => t.id === n.treatmentId && t.patientId === n.patientId)) throw new Error("Atendimento não encontrado para este paciente.");
        const now = new Date().toISOString();
        const existing = n.id ? db.clinicalNotes.find((x) => x.id === n.id) : undefined;
        if (existing) Object.assign(existing, { treatmentId: n.treatmentId, date: n.date, body, updatedAt: now });
        else db.clinicalNotes.push({ id: uid(), patientId: n.patientId, treatmentId: n.treatmentId, date: n.date, body, createdAt: now, updatedAt: now } satisfies ClinicalNote);
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.clinicalNotes = db.clinicalNotes.filter((x) => x.id !== id); }); },
  },

  anamnesis: {
    async saveTemplate(t: { id?: string; name: string; questions: AnamnesisQuestion[] }) {
      commit((db) => {
        guard(db);
        const name = t.name.trim();
        if (name.length < 2) throw new Error("Dê um nome ao modelo.");
        const questions = t.questions.filter((q) => q.text.trim()).map((q) => ({ ...q, text: q.text.trim() }));
        if (!questions.length) throw new Error("Adicione pelo menos uma pergunta.");
        const existing = t.id ? db.anamnesisTemplates.find((x) => x.id === t.id) : undefined;
        if (existing) Object.assign(existing, { name, questions });
        else db.anamnesisTemplates.push({ id: uid(), name, questions, createdAt: new Date().toISOString() });
      });
    },
    async removeTemplate(id: string) {
      commit((db) => {
        guard(db);
        db.anamnesisTemplates = db.anamnesisTemplates.filter((x) => x.id !== id);
        db.anamnesisRecords.forEach((r) => { if (r.templateId === id) delete r.templateId; });
      });
    },
    /** Cria ou atualiza um RASCUNHO; `complete` conclui (trava a ficha). `revisionOf` liga a ficha concluída que ela corrige. */
    async saveRecord(r: { id?: string; patientId: string; templateId?: string; templateName: string; answers: AnamnesisAnswer[]; filledOn: string; revisionOf?: string; complete?: boolean }) {
      commit((db) => {
        guard(db);
        if (!r.answers.length) throw new Error("A ficha está vazia.");
        if (r.complete && hasUnanswered(r.answers)) throw new Error("Responda todas as perguntas de sim ou não antes de concluir.");
        const now = new Date().toISOString();
        const { id, complete, ...data } = r;
        const existing = id ? db.anamnesisRecords.find((x) => x.id === id) : undefined;
        if (existing) {
          if (existing.status === "completed") throw new Error("Ficha concluída não pode ser alterada. Crie uma revisão.");
          Object.assign(existing, data, complete ? { status: "completed", completedAt: now } : {});
          return;
        }
        if (data.revisionOf) {
          const base = db.anamnesisRecords.find((x) => x.id === data.revisionOf);
          if (!base || base.status !== "completed" || base.patientId !== data.patientId) throw new Error("A revisão precisa apontar para uma ficha concluída do mesmo paciente.");
          if (db.anamnesisRecords.some((x) => x.revisionOf === base.id)) throw new Error("Esta ficha já tem uma revisão.");
        }
        db.anamnesisRecords.push({ ...data, id: uid(), createdAt: now, status: complete ? "completed" : "draft", completedAt: complete ? now : undefined });
      });
    },
    async removeRecord(id: string) {
      commit((db) => {
        guard(db);
        if (db.anamnesisRecords.find((x) => x.id === id)?.status === "completed") throw new Error("Ficha concluída não pode ser excluída. Crie uma revisão.");
        db.anamnesisRecords = db.anamnesisRecords.filter((x) => x.id !== id);
      });
    },
  },

  prescriptions: {
    async save(r: { id?: string; patientId: string; issuedOn: string; notes?: string; items: Omit<PrescriptionItem, "id" | "medicationId">[] }) {
      commit((db) => {
        guard(db);
        const items = checkPrescriptionItems(r.items);
        if (!db.patients.some((p) => p.id === r.patientId)) throw new Error("Paciente não encontrado.");
        const now = new Date().toISOString();
        const linked: PrescriptionItem[] = items.map((it) => {
          // Nome novo vira medicamento da clínica (único por nome, sem diferenciar maiúsculas).
          let med = db.medications.find((m) => m.name.toLowerCase() === it.name.toLowerCase());
          if (!med) {
            med = { id: uid(), name: it.name, route: it.route, controlled: it.controlled, unit: it.unit, defaultPosology: it.posology, createdAt: now } satisfies Medication;
            db.medications.push(med);
          }
          return { ...it, id: uid(), medicationId: med.id };
        });
        const existing = r.id ? db.prescriptions.find((x) => x.id === r.id) : undefined;
        if (r.id && !existing) throw new Error("Receita não encontrada.");
        if (existing) Object.assign(existing, { issuedOn: r.issuedOn, notes: r.notes?.trim() || undefined, items: linked, updatedAt: now });
        else db.prescriptions.push({ id: uid(), patientId: r.patientId, ...professionalSnapshot(db), issuedOn: r.issuedOn, notes: r.notes?.trim() || undefined, items: linked, createdAt: now, updatedAt: now } satisfies Prescription);
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.prescriptions = db.prescriptions.filter((x) => x.id !== id); }); },
  },

  medications: {
    async update(id: string, m: { name: string; route: Medication["route"]; controlled: boolean; unit?: string; defaultPosology?: string }) {
      commit((db) => {
        guard(db);
        const cur = db.medications.find((x) => x.id === id);
        if (!cur) throw new Error("Medicamento não encontrado.");
        const name = m.name.trim();
        if (!name) throw new Error("Informe o nome do medicamento.");
        if (db.medications.some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) throw new Error("Já existe um medicamento com esse nome.");
        Object.assign(cur, { name, route: m.route, controlled: m.controlled, unit: m.unit?.trim() || undefined, defaultPosology: m.defaultPosology?.trim() || undefined });
      });
    },
    /** Acrescenta só os presets que a clínica ainda não tem (por nome); nunca sobrescreve o que ela editou. */
    async importPresets(items: { name: string; route: Medication["route"]; controlled: boolean; unit?: string; posology: string }[]) {
      let added = 0;
      commit((db) => {
        guard(db);
        const now = new Date().toISOString();
        for (const it of items) {
          if (db.medications.some((x) => x.name.toLowerCase() === it.name.toLowerCase())) continue;
          db.medications.push({ id: uid(), name: it.name, route: it.route, controlled: it.controlled, unit: it.unit, defaultPosology: it.posology, createdAt: now });
          added++;
        }
      });
      return added;
    },
    // Receitas já emitidas guardam o nome em cada item, então seguem iguais.
    async remove(id: string) {
      commit((db) => {
        guard(db);
        db.medications = db.medications.filter((x) => x.id !== id);
        db.prescriptions.forEach((r) => r.items.forEach((i) => { if (i.medicationId === id) delete i.medicationId; }));
      });
    },
  },

  prescriptionTemplates: {
    async rename(id: string, name: string) {
      commit((db) => {
        guard(db);
        const t = db.prescriptionTemplates.find((x) => x.id === id);
        if (!t) throw new Error("Modelo não encontrado.");
        const n = name.trim();
        if (n.length < 2) throw new Error("Dê um nome ao modelo.");
        if (db.prescriptionTemplates.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error("Já existe um modelo com esse nome.");
        t.name = n;
      });
    },
    async save(t: { name: string; items: PrescriptionTemplate["items"] }) {
      commit((db) => {
        guard(db);
        const name = t.name.trim();
        if (name.length < 2) throw new Error("Dê um nome ao modelo.");
        if (db.prescriptionTemplates.some((x) => x.name.toLowerCase() === name.toLowerCase())) throw new Error("Já existe um modelo com esse nome.");
        const items = checkPrescriptionItems(t.items).map(({ name: n, quantity, unit, posology, route, controlled }) => ({ name: n, quantity, unit, posology, route, controlled }));
        db.prescriptionTemplates.push({ id: uid(), name, items, createdAt: new Date().toISOString() });
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.prescriptionTemplates = db.prescriptionTemplates.filter((x) => x.id !== id); }); },
  },

  certificates: {
    async save(c: { id?: string; patientId: string; issuedOn: string; startsOn: string; kind: Certificate["kind"]; amount: number; cid?: string; cidConsent: boolean; purpose?: string }) {
      commit((db) => {
        guard(db);
        if (!db.patients.some((p) => p.id === c.patientId)) throw new Error("Paciente não encontrado.");
        if (c.kind !== "days" && c.kind !== "hours") throw new Error("Escolha se o atestado é por dias ou por horas.");
        const max = c.kind === "days" ? 365 : 24;
        if (!Number.isInteger(c.amount) || c.amount < 1 || c.amount > max) throw new Error(`Informe de 1 a ${max} ${c.kind === "days" ? "dias" : "horas"}.`);
        const cid = c.cid?.trim() || undefined;
        if (cid && !c.cidConsent) throw new Error("O CID só pode constar com o consentimento do paciente.");
        const now = new Date().toISOString();
        const body = { issuedOn: c.issuedOn, startsOn: c.startsOn, kind: c.kind, amount: c.amount, cid, cidConsent: !!cid, purpose: c.purpose?.trim() || undefined, updatedAt: now };
        const existing = c.id ? db.certificates.find((x) => x.id === c.id) : undefined;
        if (c.id && !existing) throw new Error("Atestado não encontrado.");
        if (existing) Object.assign(existing, body);
        else db.certificates.push({ id: uid(), patientId: c.patientId, ...professionalSnapshot(db), ...body, createdAt: now } satisfies Certificate);
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.certificates = db.certificates.filter((x) => x.id !== id); }); },
  },

  customDocuments: {
    async save(d: { id?: string; patientId: string; issuedOn: string; title: string; body: string }) {
      commit((db) => {
        guard(db);
        if (!db.patients.some((p) => p.id === d.patientId)) throw new Error("Paciente não encontrado.");
        const title = d.title.trim(), body = d.body.trim();
        if (!title) throw new Error("Dê um título ao documento.");
        if (!body) throw new Error("Escreva o texto do documento.");
        if (title.length > 120 || body.length > 10000) throw new Error("Título ou texto longo demais.");
        const now = new Date().toISOString();
        const existing = d.id ? db.customDocuments.find((x) => x.id === d.id) : undefined;
        if (d.id && !existing) throw new Error("Documento não encontrado.");
        if (existing) Object.assign(existing, { title, body, issuedOn: d.issuedOn, updatedAt: now });
        else db.customDocuments.push({ id: uid(), patientId: d.patientId, ...professionalSnapshot(db), title, body, issuedOn: d.issuedOn, createdAt: now, updatedAt: now } satisfies CustomDocument);
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.customDocuments = db.customDocuments.filter((x) => x.id !== id); }); },
  },

  patientFiles: {
    // shortcut: na demonstração o arquivo vai inteiro para o localStorage (limite de 1 MB; storage cheio falha em silêncio, como o resto da camada falsa); na nuvem vai para o storage privado.
    async add(patientId: string, file: File) {
      guard(load());
      const mime = checkFile(file, MAX_DEMO_FILE_BYTES);
      const dataUrl = await readAsDataUrl(file);
      commit((db) => {
        guard(db);
        if (!db.patients.some((p) => p.id === patientId)) throw new Error("Paciente não encontrado.");
        db.patientFiles.push({ id: uid(), patientId, name: file.name.slice(0, 200), mime, sizeBytes: file.size, createdAt: new Date().toISOString(), dataUrl });
      });
    },
    async remove(id: string) { commit((db) => { guard(db); db.patientFiles = db.patientFiles.filter((x) => x.id !== id); }); },
    async url(id: string): Promise<string> {
      const f = load().patientFiles.find((x) => x.id === id);
      if (!f?.dataUrl) throw new Error("Arquivo não encontrado.");
      // Navegadores bloqueiam abrir data URL em aba nova; um blob: abre.
      return URL.createObjectURL(await (await fetch(f.dataUrl)).blob());
    },
  },

  sales: {
    async createOpportunity(o: { patientId: string; title: string; valueCents: number; responsible?: string }) {
      const id = uid();
      commit((db) => {
        guard(db);
        const title = o.title.trim();
        if (!title) throw new Error("Dê um título à oportunidade.");
        if (title.length > 120) throw new Error("Título longo demais (até 120 caracteres).");
        if (!Number.isInteger(o.valueCents) || o.valueCents < 0) throw new Error("Informe um valor válido.");
        if (!db.patients.some((p) => p.id === o.patientId)) throw new Error("Escolha o paciente.");
        const stage = stageOfKind(db, "open");
        if (!stage) throw new Error("Etapas do funil não encontradas.");
        const now = new Date().toISOString();
        const responsible = o.responsible?.trim().slice(0, 120) || undefined;
        db.opportunities.push({ id, patientId: o.patientId, stageId: stage.id, title, valueCents: o.valueCents, responsible, createdAt: now, updatedAt: now, stageChangedAt: now } satisfies Opportunity);
        pushEvent(db, id, "system", "Criou esta oportunidade", db.profile.professionalName || undefined);
      });
      return id;
    },
    async updateOpportunity(id: string, patch: { title?: string; valueCents?: number; responsible?: string; label?: string }) {
      commit((db) => {
        guard(db);
        const o = db.opportunities.find((x) => x.id === id);
        if (!o) throw new Error("Oportunidade não encontrada.");
        if (patch.title !== undefined) {
          const t = patch.title.trim();
          if (!t || t.length > 120) throw new Error("O título precisa ter de 1 a 120 caracteres.");
          o.title = t;
        }
        if (patch.valueCents !== undefined) {
          if (!Number.isInteger(patch.valueCents) || patch.valueCents < 0) throw new Error("Informe um valor válido.");
          o.valueCents = patch.valueCents;
        }
        if ("responsible" in patch) o.responsible = patch.responsible?.trim().slice(0, 120) || undefined;
        if ("label" in patch) o.label = patch.label?.trim().slice(0, 30) || undefined;
        o.updatedAt = new Date().toISOString();
      });
    },
    async moveOpportunity(id: string, stageId: string) {
      commit((db) => {
        guard(db);
        const o = db.opportunities.find((x) => x.id === id);
        if (!o) throw new Error("Oportunidade não encontrada.");
        if (!db.salesStages.some((s) => s.id === stageId)) throw new Error("Etapa não encontrada.");
        moveOpportunity(db, o, stageId, db.profile.professionalName || undefined);
      });
    },
    async addComment(opportunityId: string, body: string) {
      commit((db) => {
        guard(db);
        const text = body.trim();
        if (!text) throw new Error("Escreva o comentário.");
        if (text.length > MAX_COMMENT) throw new Error(`O comentário pode ter até ${MAX_COMMENT} caracteres.`);
        if (!db.opportunities.some((x) => x.id === opportunityId)) throw new Error("Oportunidade não encontrada.");
        pushEvent(db, opportunityId, "comment", text, db.profile.professionalName || undefined);
      });
    },
    async createStage(name: string) {
      commit((db) => {
        guard(db);
        const n = name.trim();
        if (!n || n.length > 40) throw new Error("O nome da etapa precisa ter de 1 a 40 caracteres.");
        if (db.salesStages.some((s) => s.name.toLowerCase() === n.toLowerCase())) throw new Error("Já existe uma etapa com esse nome.");
        db.salesStages.push({ id: uid(), name: n, position: Math.max(-1, ...db.salesStages.map((s) => s.position)) + 1 });
      });
    },
    async renameStage(id: string, name: string) {
      commit((db) => {
        guard(db);
        const s = db.salesStages.find((x) => x.id === id);
        const n = name.trim();
        if (!s) throw new Error("Etapa não encontrada.");
        if (!n || n.length > 40) throw new Error("O nome da etapa precisa ter de 1 a 40 caracteres.");
        if (db.salesStages.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) throw new Error("Já existe uma etapa com esse nome.");
        s.name = n;
      });
    },
    /** Etapas padrão não saem. Etapa com cartões só sai se `moveToId` disser para onde eles vão. */
    async deleteStage(id: string, moveToId?: string) {
      commit((db) => {
        guard(db);
        const s = db.salesStages.find((x) => x.id === id);
        if (!s) throw new Error("Etapa não encontrada.");
        if (s.kind) throw new Error("As etapas padrão não podem ser excluídas.");
        const cards = db.opportunities.filter((o) => o.stageId === id);
        if (cards.length) {
          if (!moveToId || moveToId === id || !db.salesStages.some((x) => x.id === moveToId)) throw new Error("Escolha outra etapa para mover os cartões.");
          cards.forEach((o) => moveOpportunity(db, o, moveToId, db.profile.professionalName || undefined));
        }
        db.salesStages = sortedStages(db).filter((x) => x.id !== id);
      });
    },
    async setGoal(month: string, cents: number) {
      commit((db) => {
        guard(db);
        if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido.");
        if (!Number.isInteger(cents) || cents < 0) throw new Error("Informe um valor válido.");
        if (cents === 0) delete db.salesGoals[month]; else db.salesGoals[month] = cents;
      });
    },
  },

  prosthesis: {
    async createLab(input: { name: string; phone?: string; notes?: string }) {
      const lab = { id: uid(), ...normalizeLab(input) };
      commit((db) => {
        guard(db);
        if (db.laboratories.some((l) => l.name.toLowerCase() === lab.name.toLowerCase())) throw new Error("Já existe um laboratório com esse nome.");
        db.laboratories.push(lab);
      });
      return lab.id;
    },
    async updateLab(id: string, input: { name: string; phone?: string; notes?: string }) {
      commit((db) => {
        guard(db);
        const l = db.laboratories.find((x) => x.id === id);
        if (!l) throw new Error("Laboratório não encontrado.");
        const n = normalizeLab(input);
        if (db.laboratories.some((x) => x.id !== id && x.name.toLowerCase() === n.name.toLowerCase())) throw new Error("Já existe um laboratório com esse nome.");
        Object.assign(l, { phone: undefined, notes: undefined }, n);
      });
    },
    /** Os serviços do laboratório excluído ficam, só sem laboratório. */
    async deleteLab(id: string) {
      commit((db) => {
        guard(db);
        db.laboratories = db.laboratories.filter((x) => x.id !== id);
        db.prosthesisJobs.forEach((j) => { if (j.laboratoryId === id) j.laboratoryId = undefined; });
      });
    },
    async createJob(input: JobInput) {
      const id = uid();
      commit((db) => {
        guard(db);
        const f = normalizeJob(input);
        if (!db.patients.some((p) => p.id === f.patientId)) throw new Error("Escolha o paciente.");
        if (f.laboratoryId && !db.laboratories.some((l) => l.id === f.laboratoryId)) throw new Error("Laboratório não encontrado.");
        const now = new Date().toISOString();
        db.prosthesisJobs.push({ id, stage: "pre_lab", ...f, createdAt: now, updatedAt: now, stageChangedAt: now });
        addProsthesisEvent(db, id, "system", "Criou este serviço", db.profile.professionalName || undefined);
      });
      return id;
    },
    async updateJob(id: string, input: JobInput) {
      commit((db) => {
        guard(db);
        const j = db.prosthesisJobs.find((x) => x.id === id);
        if (!j) throw new Error("Serviço não encontrado.");
        const f = normalizeJob(input);
        if (f.laboratoryId && !db.laboratories.some((l) => l.id === f.laboratoryId)) throw new Error("Laboratório não encontrado.");
        if (f.isReturn && !j.isReturn) addProsthesisEvent(db, id, "system", `Marcado como retorno: ${f.returnReason}`, db.profile.professionalName || undefined);
        Object.assign(j, { teeth: undefined, shade: undefined, laboratoryId: undefined, sentOn: undefined, dueOn: undefined, costCents: undefined, notes: undefined, label: undefined, returnReason: undefined }, f, { patientId: j.patientId, updatedAt: new Date().toISOString() });
      });
    },
    async moveJob(id: string, stage: ProsthesisJob["stage"]) {
      commit((db) => {
        guard(db);
        const j = db.prosthesisJobs.find((x) => x.id === id);
        if (!j) throw new Error("Serviço não encontrado.");
        moveProsthesis(db, j, stage, db.profile.professionalName || undefined);
      });
    },
    async addComment(jobId: string, body: string) {
      commit((db) => {
        guard(db);
        const text = body.trim();
        if (!text) throw new Error("Escreva o comentário.");
        if (text.length > MAX_COMMENT) throw new Error(`O comentário pode ter até ${MAX_COMMENT} caracteres.`);
        if (!db.prosthesisJobs.some((x) => x.id === jobId)) throw new Error("Serviço não encontrado.");
        addProsthesisEvent(db, jobId, "comment", text, db.profile.professionalName || undefined);
      });
    },
    async deleteJob(id: string) {
      commit((db) => {
        guard(db);
        db.prosthesisJobs = db.prosthesisJobs.filter((x) => x.id !== id);
        db.prosthesisEvents = db.prosthesisEvents.filter((e) => e.jobId !== id);
      });
    },
  },

  /** Convênios: cadastro, tabela de repasse e faturamento por lote. Regras de valores em ./convenios. */
  insurance: {
    async saveInsurer(f: InsurerInput) {
      const row = normalizeInsurer(f);
      commit((db) => {
        guard(db);
        if (db.insurers.some((x) => x.id !== f.id && normName(x.name) === normName(row.name))) throw new Error("Já existe um convênio com esse nome.");
        const cur = f.id ? db.insurers.find((x) => x.id === f.id) : undefined;
        if (f.id && !cur) throw new Error("Convênio não encontrado.");
        if (cur) Object.assign(cur, row, { suggested: f.suggested ? true : undefined }); else db.insurers.push({ ...row, id: uid() });
      });
    },
    /** Importa a lista sugerida sem duplicar por nome normalizado. Devolve quantos entraram. */
    async importPreset(list: { name: string; type: InsurerInput["type"]; ans?: string }[]) {
      let added = 0;
      commit((db) => {
        guard(db);
        const have = new Set(db.insurers.map((x) => normName(x.name)));
        for (const p of list) {
          if (have.has(normName(p.name))) continue;
          have.add(normName(p.name)); added++;
          db.insurers.push({ id: uid(), name: p.name, type: p.type, ansCode: p.ans || undefined, active: false, paymentDays: 30, closingDay: 30, defaultGlossPercent: 0, suggested: true });
        }
      });
      return added;
    },
    async removeInsurer(id: string) {
      commit((db) => {
        guard(db);
        if (db.billingBatches.some((b) => b.insurerId === id)) throw new Error("Este convênio tem lotes de faturamento. Desative em vez de excluir.");
        db.insurers = db.insurers.filter((x) => x.id !== id);
        db.insurerPrices = db.insurerPrices.filter((p) => p.insurerId !== id);
        db.patients.forEach((p) => { if (p.insurerId === id) { p.insurerId = undefined; p.insuranceCard = undefined; p.insuranceValidUntil = undefined; } });
      });
    },
    async savePrice(insurerId: string, procedureKey: string, procedureName: string, priceCents: number) {
      if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("Informe um valor válido.");
      commit((db) => {
        guard(db);
        if (!db.insurers.some((x) => x.id === insurerId)) throw new Error("Convênio não encontrado.");
        const cur = db.insurerPrices.find((p) => p.insurerId === insurerId && p.procedureKey === procedureKey);
        if (cur) cur.priceCents = priceCents; else db.insurerPrices.push({ id: uid(), insurerId, procedureKey, procedureName, priceCents });
      });
    },
    async removePrice(insurerId: string, procedureKey: string) {
      commit((db) => { guard(db); db.insurerPrices = db.insurerPrices.filter((p) => !(p.insurerId === insurerId && p.procedureKey === procedureKey)); });
    },
    /** Cria o lote com os atendimentos escolhidos (só os elegíveis: do convênio, concluídos e fora de outro lote). */
    async createBatch(insurerId: string, year: number, month: number, treatmentIds: string[], professionalName?: string) {
      const id = uid();
      commit((db) => {
        guard(db);
        const ins = db.insurers.find((x) => x.id === insurerId);
        if (!ins) throw new Error("Convênio não encontrado.");
        const ok = new Set(treatmentIds);
        const list = eligibleTreatments(db, insurerId, year, month).filter((t) => ok.has(t.id));
        if (!list.length) throw new Error("Escolha ao menos um atendimento para faturar.");
        db.billingBatches.push({ id, insurerId, year, month, status: "draft", cashedCents: 0, createdAt: new Date().toISOString() });
        itemsFromTreatments(db, ins, list, professionalName).forEach((i) => db.billingItems.push({ ...i, id: uid(), batchId: id }));
      });
      return id;
    },
    async submitBatch(id: string, protocol: string, sentOn: string) {
      commit((db) => {
        guard(db);
        const b = db.billingBatches.find((x) => x.id === id);
        if (!b) throw new Error("Lote não encontrado.");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) throw new Error("Informe a data de envio.");
        const ins = db.insurers.find((x) => x.id === b.insurerId);
        b.protocol = protocol.trim().slice(0, 60) || undefined; b.sentOn = sentOn; b.expectedOn = expectedPayment(sentOn, ins?.paymentDays ?? 30);
        b.status = batchStatus(b.sentOn, db.billingItems.filter((i) => i.batchId === id));
      });
    },
    /** Registra pagamento e glosa de um item e recalcula o status do lote. */
    async updateItem(id: string, f: { paidCents: number; glossCents: number; glossReason?: string }) {
      commit((db) => {
        guard(db);
        const it = db.billingItems.find((x) => x.id === id);
        if (!it) throw new Error("Item não encontrado.");
        checkItemAmounts(it.billedCents, f.paidCents, f.glossCents, f.glossReason);
        const b = db.billingBatches.find((x) => x.id === it.batchId);
        if (!b?.sentOn) throw new Error("Marque o lote como enviado antes de registrar pagamento.");
        Object.assign(it, { paidCents: f.paidCents, glossCents: f.glossCents, glossReason: f.glossCents > 0 ? f.glossReason?.trim().slice(0, 300) : undefined, status: itemStatus(it.billedCents, f.paidCents, f.glossCents) });
        b.status = batchStatus(b.sentOn, db.billingItems.filter((i) => i.batchId === b.id));
      });
    },
    /** Lança no caixa o que o convênio pagou e ainda não entrou (mesma regra da RPC cash_billing_batch). */
    async cashBatch(id: string) {
      let amount = 0;
      commit((db) => {
        guard(db);
        const b = db.billingBatches.find((x) => x.id === id);
        if (!b) throw new Error("Lote não encontrado.");
        if (!b.sentOn) throw new Error("Marque o lote como enviado antes de lançar no caixa.");
        const paid = db.billingItems.filter((i) => i.batchId === id).reduce((s, i) => s + i.paidCents, 0);
        amount = paid - batchCashed(db, id);
        if (amount <= 0) throw new Error("Nada novo a lançar no caixa para este lote.");
        const ins = db.insurers.find((x) => x.id === b.insurerId);
        db.cashMovements.push({ id: uid(), kind: "in", date: todayISO(), amountCents: amount, method: "insurance", category: "Convênio", billingBatchId: id,
          description: `${ins?.name ?? "Convênio"} — lote ${String(b.month).padStart(2, "0")}/${b.year}${b.protocol ? ` (protocolo ${b.protocol})` : ""}` });
        b.cashedCents = paid;
      });
      return amount;
    },
    async removeBatch(id: string) {
      commit((db) => {
        guard(db);
        db.billingItems = db.billingItems.filter((i) => i.batchId !== id);
        db.billingBatches = db.billingBatches.filter((b) => b.id !== id);
      });
    },
  },

  expenses: {
    async create(e: Omit<Expense, "id">) { commit((db) => { guard(db); db.expenses.push({ ...e, id: uid() }); }); },
    async setPaid(id: string, paid: boolean) { commit((db) => { guard(db); const e = db.expenses.find((x) => x.id === id); if (e) e.paid = paid; }); },
    async remove(id: string) { commit((db) => { guard(db); db.expenses = db.expenses.filter((x) => x.id !== id); }); },
  },

  cash: {
    async addMovement(m: Omit<CashMovement, "id" | "reversedAt" | "reversalReason">) {
      const check = checkMovement(m); if (check) throw new Error(check);
      commit((db) => { guard(db); db.cashMovements.push({ ...m, description: m.description?.trim() || undefined, id: uid() }); });
    },
    /** Estorno com motivo; nunca apaga. Recebimento de paciente estornado deixa de contar no caixa e na comissão. */
    async reverse(source: "installment" | "treatment" | "movement", id: string, reason: string) {
      const r = reason.trim(); if (r.length < 3) throw new Error("Diga o motivo do estorno.");
      const at = new Date().toISOString();
      commit((db) => {
        guard(db);
        if (source === "movement") {
          const m = db.cashMovements.find((x) => x.id === id);
          if (!m || m.reversedAt) throw new Error("Lançamento não encontrado ou já estornado.");
          m.reversedAt = at; m.reversalReason = r;
          // Estornar a entrada do convênio devolve o valor ao "a lançar" do lote (como o gatilho do banco).
          const b = m.billingBatchId ? db.billingBatches.find((x) => x.id === m.billingBatchId) : undefined;
          if (b) b.cashedCents = batchCashed(db, b.id);
          return;
        }
        let meta = db.cashReceipts.find((x) => x.sourceType === source && x.sourceId === id);
        if (meta?.reversedAt) throw new Error("Recebimento já estornado.");
        if (!meta) { meta = { id: uid(), sourceType: source, sourceId: id }; db.cashReceipts.push(meta); }
        meta.reversedAt = at; meta.reversalReason = r;
      });
    },
    async setReceipt(sourceType: "installment" | "treatment", sourceId: string, patch: { professionalId?: string; method?: CashMethod }) {
      commit((db) => {
        guard(db);
        let meta = db.cashReceipts.find((x) => x.sourceType === sourceType && x.sourceId === sourceId);
        if (meta?.reversedAt) throw new Error("Recebimento estornado não pode ser alterado.");
        if (!meta) { meta = { id: uid(), sourceType, sourceId }; db.cashReceipts.push(meta); }
        if ("professionalId" in patch) meta.professionalId = patch.professionalId || undefined;
        if ("method" in patch) meta.method = patch.method;
      });
    },
    async openDay(day: string, openingCents: number) {
      if (!Number.isInteger(openingCents) || openingCents < 0) throw new Error("Valor de abertura inválido.");
      commit((db) => {
        guard(db);
        const d = db.cashDays.find((x) => x.day === day);
        if (d?.closedAt) throw new Error("Caixa do dia já fechado.");
        if (d) d.openingCents = openingCents; else db.cashDays.push({ id: uid(), day, openingCents });
      });
    },
    async closeDay(day: string, countedCents: number, notes?: string) {
      if (!Number.isInteger(countedCents) || countedCents < 0) throw new Error("Valor contado inválido.");
      commit((db) => {
        guard(db);
        let d = db.cashDays.find((x) => x.day === day);
        if (d?.closedAt) throw new Error("Caixa do dia já fechado.");
        if (!d) { d = { id: uid(), day, openingCents: 0 }; db.cashDays.push(d); }
        d.countedCents = countedCents; d.closedAt = new Date().toISOString(); d.notes = notes?.trim() || undefined;
      });
    },
    async saveRule(r: Omit<CommissionRule, "id">) {
      const check = checkRule(r); if (check) throw new Error(check);
      commit((db) => {
        guard(db);
        if (!db.professionals.some((p) => p.id === r.professionalId)) throw new Error("Dentista não encontrado.");
        const key = r.procedureKey.trim();
        const ex = db.commissionRules.find((x) => x.professionalId === r.professionalId && x.procedureKey.toLowerCase() === key.toLowerCase());
        if (ex) { ex.percent = r.percent; ex.labCostPercent = r.labCostPercent; } else db.commissionRules.push({ ...r, procedureKey: key, id: uid() });
      });
    },
    async removeRule(id: string) { commit((db) => { guard(db); db.commissionRules = db.commissionRules.filter((x) => x.id !== id); }); },
    /** Paga a comissão: cria o pagamento e a SAÍDA no caixa ligada a ele. Cada recebimento só entra em um pagamento. */
    async payCommission(p: { professionalId: string; periodFrom: string; periodTo: string; paidOn: string; method: CashMethod; items: CommissionPayoutItem[] }) {
      const total = p.items.reduce((s, i) => s + i.amountCents, 0);
      if (!p.items.length || total <= 0) throw new Error("Nada a pagar.");
      commit((db) => {
        guard(db);
        const pro = db.professionals.find((x) => x.id === p.professionalId);
        if (!pro) throw new Error("Dentista não encontrado.");
        const done = new Set(db.commissionPayouts.flatMap((x) => x.items.map((i) => `${i.sourceType}:${i.sourceId}`)));
        if (p.items.some((i) => done.has(`${i.sourceType}:${i.sourceId}`))) throw new Error("Algum recebimento já teve a comissão paga. Atualize a tela.");
        const payoutId = uid();
        db.commissionPayouts.push({ id: payoutId, professionalId: pro.id, professionalName: pro.name, periodFrom: p.periodFrom, periodTo: p.periodTo, amountCents: total, paidOn: p.paidOn, items: p.items });
        db.cashMovements.push({ id: uid(), kind: "out", date: p.paidOn, amountCents: total, method: p.method, category: "Comissão", description: `Comissão de ${pro.name} (${p.periodFrom} a ${p.periodTo})`, professionalId: pro.id, payoutId });
      });
    },
  },

  catalog: {
    async createCustomProcedure(name: string, specialtyId: string) {
      const id = `custom-${uid()}`;
      commit((db) => { guard(db); db.customProcedures.push({ id, name, specialtyId, group: "Meus procedimentos", custom: true }); });
      return id;
    },
    async setPrice(procedureId: string, cents: number | undefined) {
      commit((db) => {
        guard(db);
        if (cents === undefined) delete db.prices[procedureId];
        else db.prices[procedureId] = cents;
      });
    },
    async setRecallMonths(procedureId: string, months: number | undefined) {
      commit((db) => {
        guard(db);
        if (months === undefined) delete db.recallMonths[procedureId];
        else db.recallMonths[procedureId] = months;
      });
    },
    async adjustAllPrices(percent: number) {
      commit((db) => {
        guard(db);
        for (const k of Object.keys(db.prices)) db.prices[k] = Math.round(db.prices[k] * (1 + percent / 100));
      });
    },
  },

  account: {
    async updateProfile(patch: Partial<Profile>) { commit((db) => { Object.assign(db.profile, patch); }); },
    async updateTemplate(t: MessageTemplate) {
      commit((db) => { db.templates = db.templates.filter((x) => x.kind !== t.kind).concat(t); });
    },
    async reset(withSeed: boolean) {
      cache = withSeed ? buildSeed(emptyDb()) : { ...emptyDb(), profile: { ...emptyDb().profile, onboardingDone: true } };
      persist();
      listeners.forEach((l) => l());
    },
    exportJson(): string { return JSON.stringify(load(), null, 2); },
  },
};

export const regionLabel = (r: PlanItem["region"]) => (r === "upper" ? "arcada superior" : r === "lower" ? "arcada inferior" : "ambas as arcadas");

export function patientStatus(db: Db, p: Patient): "in_treatment" | "open_budget" | "seen" | "new" {
  if (db.treatments.some((t) => t.patientId === p.id && t.clinicalStatus === "in_progress")) return "in_treatment";
  if (db.budgets.some((b) => b.patientId === p.id && b.status === "presented")) return "open_budget";
  if (p.lastVisitAt || db.treatments.some((t) => t.patientId === p.id)) return "seen";
  return "new";
}

export const activePatients = (db: Db) => db.patients.filter((p) => !p.archived);

export const DEFAULT_RECALL_MONTHS = 6;

/** Quando o paciente deveria voltar e em que pé está o contato. null = não está na lista de retornos. */
export function recallInfo(db: Db, p: Patient): { dueAt: string; status: RecallStatus; lastVisit: string } | null {
  if (!p.recallEnabled || p.archived || !p.lastVisitAt) return null;
  const lastVisit = p.lastVisitAt.slice(0, 10);
  const done = db.treatments.filter((t) => t.patientId === p.id && t.clinicalStatus === "done").sort((a, b) => b.performedAt.localeCompare(a.performedAt))[0];
  const months = (done?.procedureId && db.recallMonths[done.procedureId]) || DEFAULT_RECALL_MONTHS;
  const dueAt = addMonths(lastVisit, months);
  const hasFuture = db.appointments.some((a) => a.patientId === p.id && a.date >= todayISO() && a.status !== "cancelled");
  const saved = db.recall[p.id];
  const status: RecallStatus = hasFuture ? "scheduled" : saved && saved.dueAt === dueAt ? saved.status : "pending";
  if (status === "pending" && dueAt > addDays(todayISO(), 15)) return null; // ainda não é hora
  return { dueAt, status, lastVisit };
}

/** Aprovado há 7+ dias, ainda em andamento, sem consulta marcada. */
export function stalledTreatments(db: Db) {
  const limit = addDays(todayISO(), -7);
  return db.budgets
    .filter((b) => b.status === "authorized" && b.authorizedAt && b.authorizedAt.slice(0, 10) <= limit)
    .filter((b) => db.treatments.some((t) => t.budgetId === b.id && t.clinicalStatus === "in_progress"))
    .filter((b) => !db.appointments.some((a) => a.patientId === b.patientId && a.date >= todayISO() && a.status !== "cancelled"));
}

export const isOverdue = (i: Installment) => !i.paidAt && i.dueDate < todayISO();

export const isBirthdayMonth = (p: Patient) =>
  !!p.birthDate && Number(p.birthDate.slice(5, 7)) === new Date().getMonth() + 1;

export const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "pix", label: "Pix" }, { id: "credit", label: "Cartão de crédito" }, { id: "debit", label: "Cartão de débito" },
  { id: "cash", label: "Dinheiro" }, { id: "transfer", label: "Transferência" }, { id: "boleto", label: "Boleto" }, { id: "other", label: "Outro" },
];

const remoteApi = REMOTE ? makeRemoteApi(() => {
  if (remote.status !== "ready") throw new Error("Ainda carregando os dados da clínica.");
  return { sb: supabaseBrowser(), session: remote.session, db: remote.db };
}, refreshRemote) : null;

/** Mesma forma nos dois modos: as telas não sabem se é demonstração ou nuvem. */
export const api: typeof localApi = remoteApi ? {
  patients: remoteApi.patients as unknown as typeof localApi.patients,
  plans: localApi.plans, // não usado no modo nuvem
  budgetsFromPlan: { createBudget: (plan) => remoteApi.plans.saveAsBudget(JSON.stringify(plan)) },
  budgets: { approvedTotal: localApi.budgets.approvedTotal, authorize: remoteApi.budgets.authorize, decline: remoteApi.budgets.decline },
  installments: remoteApi.installments,
  treatments: remoteApi.treatments,
  appointments: remoteApi.appointments,
  professionals: remoteApi.professionals,
  timeBlocks: remoteApi.timeBlocks,
  waitlist: remoteApi.waitlist,
  recall: remoteApi.recall,
  expenses: remoteApi.expenses,
  cash: remoteApi.cash,
  insurance: remoteApi.insurance,
  sales: remoteApi.sales,
  prosthesis: remoteApi.prosthesis,
  clinicalNotes: remoteApi.clinicalNotes,
  prescriptions: remoteApi.prescriptions,
  medications: remoteApi.medications,
  prescriptionTemplates: remoteApi.prescriptionTemplates,
  certificates: remoteApi.certificates,
  customDocuments: remoteApi.customDocuments,
  patientFiles: remoteApi.patientFiles,
  anamnesis: remoteApi.anamnesis,
  catalog: remoteApi.catalog,
  account: {
    updateProfile: remoteApi.account.updateProfile,
    updateTemplate: remoteApi.account.updateTemplate,
    async reset() { throw new Error("No modo nuvem os dados não podem ser apagados daqui. Use Ajustes › Excluir conta."); },
    exportJson: () => JSON.stringify(remote.status === "ready" ? remote.db : {}, null, 2),
  },
} : localApi;
