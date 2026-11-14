"use client";

// Camada de dados FALSA (localStorage). As funções de `api` têm a mesma forma
// das server actions planejadas em replica/architecture.md, para que o
// replica-backend troque a implementação sem mexer no código das telas.

import { useSyncExternalStore } from "react";
import type {
  AnamnesisAnswer, AnamnesisQuestion, ClinicalNote,
  Appointment, Db, Expense, Installment, Patient, PatientEvent, PaymentMethod, PlanItem,
  Procedure, Profile, RecallStatus, Treatment, TreatmentPlan, MessageTemplate, WaitlistEntry,
} from "./types";
import { BASE_PROCEDURES, DEFAULT_ACTIVE_SPECIALTIES } from "./catalog";
import { addDays, todayISO, uid } from "./format";
import { buildSeed } from "./seed";
import { REMOTE, supabaseBrowser } from "./supabase/client";
import { loadRemote, makeRemoteApi, type RemoteState } from "./remote";

const KEY = "consultorio-db-v1";
const VERSION = 3;
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
      });
    },
    async decline(budgetId: string) {
      commit((db) => {
        guard(db);
        const b = db.budgets.find((x) => x.id === budgetId);
        if (!b) throw new Error("Orçamento não encontrado.");
        if (b.status !== "presented") throw new Error("Esse orçamento já foi respondido.");
        b.status = "declined";
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
    async save(a: Omit<Appointment, "id"> & { id?: string }) {
      commit((db) => {
        guard(db);
        if (a.time && a.status !== "cancelled") {
          const start = toMin(a.time), end = start + a.durationMinutes;
          const clash = db.appointments.find((x) => x.id !== a.id && x.date === a.date && x.time && x.status !== "cancelled"
            && toMin(x.time) < end && start < toMin(x.time) + x.durationMinutes);
          if (clash) throw new Error(`Esse horário bate com outro compromisso às ${clash.time}.`);
        }
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
    async saveRecord(r: { patientId: string; templateId?: string; templateName: string; answers: AnamnesisAnswer[]; filledOn: string }) {
      commit((db) => {
        guard(db);
        if (!r.answers.length) throw new Error("A ficha está vazia.");
        db.anamnesisRecords.push({ ...r, id: uid(), createdAt: new Date().toISOString() });
      });
    },
    async removeRecord(id: string) { commit((db) => { guard(db); db.anamnesisRecords = db.anamnesisRecords.filter((x) => x.id !== id); }); },
  },

  expenses: {
    async create(e: Omit<Expense, "id">) { commit((db) => { guard(db); db.expenses.push({ ...e, id: uid() }); }); },
    async setPaid(id: string, paid: boolean) { commit((db) => { guard(db); const e = db.expenses.find((x) => x.id === id); if (e) e.paid = paid; }); },
    async remove(id: string) { commit((db) => { guard(db); db.expenses = db.expenses.filter((x) => x.id !== id); }); },
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

function toMin(t: string) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

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
  waitlist: remoteApi.waitlist,
  recall: remoteApi.recall,
  expenses: remoteApi.expenses,
  clinicalNotes: remoteApi.clinicalNotes,
  anamnesis: remoteApi.anamnesis,
  catalog: remoteApi.catalog,
  account: {
    updateProfile: remoteApi.account.updateProfile,
    updateTemplate: remoteApi.account.updateTemplate,
    async reset() { throw new Error("No modo nuvem os dados não podem ser apagados daqui. Use Ajustes › Excluir conta."); },
    exportJson: () => JSON.stringify(remote.status === "ready" ? remote.db : {}, null, 2),
  },
} : localApi;
