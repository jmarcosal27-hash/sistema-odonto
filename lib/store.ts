"use client";

// Camada de dados FALSA (localStorage). As funções de `api` têm a mesma forma
// das server actions planejadas em replica/architecture.md, para que o
// replica-backend troque a implementação sem mexer no código das telas.

import { useSyncExternalStore } from "react";
import type {
  Appointment, Db, Expense, Patient, PatientEvent, PlanItem, Procedure,
  Profile, Treatment, TreatmentPlan, MessageTemplate,
} from "./types";
import { BASE_PROCEDURES, DEFAULT_ACTIVE_SPECIALTIES } from "./catalog";
import { addDays, todayISO, uid } from "./format";
import { buildSeed } from "./seed";

const KEY = "consultorio-db-v1";
const listeners = new Set<() => void>();
let cache: Db | null = null;

export function emptyDb(): Db {
  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(now.getFullYear() + 1);
  return {
    version: 1,
    patients: [], events: [], customProcedures: [], prices: {}, plans: [],
    budgets: [], treatments: [], expenses: [], appointments: [],
    templates: [
      { kind: "confirmation", body: "Olá, {nome}! Passando para confirmar seu horário em {data} às {hora}. Pode responder com SIM para confirmar? 😊" },
      { kind: "recall", body: "Oi, {nome}! Faz um tempinho desde a sua última visita. Que tal agendar uma revisão? Tenho horários nesta semana." },
    ],
    profile: { workMode: "solo", theme: "system", activeSpecialtyIds: DEFAULT_ACTIVE_SPECIALTIES, onboardingDone: false },
    access: { plan: "Anual", startsAt: now.toISOString(), expiresAt: expires.toISOString(), email: "voce@exemplo.com" },
  };
}

function load(): Db {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Db) : buildSeed(emptyDb());
    if (!raw) persist();
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
  return useSyncExternalStore(subscribe, load, () => null);
}

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

export const planTotal = (items: PlanItem[]) => items.reduce((s, i) => s + (i.priceCents ?? 0), 0);

export const api = {
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
        plan.status = "budgeted";
        db.budgets.push({
          id, planId, patientId: plan.patientId, totalCents: planTotal(plan.items),
          status: "presented", authorizedItemIds: [], presentedAt: new Date().toISOString(),
        });
        event(db, plan.patientId, "budget_presented", "Orçamento apresentado");
      });
      return id;
    },
  },

  budgets: {
    async authorize(budgetId: string, itemIds?: string[]) {
      commit((db) => {
        guard(db);
        const b = db.budgets.find((x) => x.id === budgetId);
        const plan = b && db.plans.find((p) => p.id === b.planId);
        if (!b || !plan) throw new Error("Orçamento não encontrado.");
        const chosen = plan.items.filter((i) => !itemIds || itemIds.includes(i.id));
        if (!chosen.length) throw new Error("Escolha pelo menos um item para aprovar.");
        b.status = "authorized";
        b.authorizedItemIds = chosen.map((i) => i.id);
        b.authorizedAt = new Date().toISOString();
        plan.status = "authorized";
        chosen.forEach((item) => db.treatments.push({
          id: uid(), patientId: b.patientId, budgetId: b.id, planItemId: item.id,
          procedureName: (item.procedureName ?? "Procedimento") + (item.tooth ? ` · dente ${item.tooth}` : ""),
          performedAt: todayISO(), priceCents: item.priceCents ?? 0,
          paymentStatus: "pending", clinicalStatus: "in_progress", createdAt: new Date().toISOString(),
        }));
        event(db, b.patientId, "budget_authorized",
          chosen.length === plan.items.length ? "Orçamento aprovado" : `Orçamento aprovado em parte (${chosen.length} de ${plan.items.length} itens)`);
      });
    },
    async decline(budgetId: string) {
      commit((db) => {
        guard(db);
        const b = db.budgets.find((x) => x.id === budgetId);
        if (b) b.status = "declined";
      });
    },
  },

  treatments: {
    async log(input: Omit<Treatment, "id" | "createdAt"> & { nextAppointmentDate?: string }) {
      const { nextAppointmentDate, ...t } = input;
      commit((db) => {
        guard(db);
        db.treatments.push({ ...t, id: uid(), createdAt: new Date().toISOString() });
        const p = db.patients.find((x) => x.id === t.patientId);
        if (p && (!p.lastVisitAt || p.lastVisitAt < t.performedAt)) p.lastVisitAt = t.performedAt;
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
        if (patch.clinicalStatus === "done") {
          const p = db.patients.find((x) => x.id === t.patientId);
          if (p && (!p.lastVisitAt || p.lastVisitAt < todayISO())) p.lastVisitAt = todayISO();
        }
        if (wasPending && patch.paymentStatus === "received") event(db, t.patientId, "payment_received", `Recebido: ${t.procedureName}`);
      });
    },
  },

  appointments: {
    async save(a: Omit<Appointment, "id"> & { id?: string }) {
      commit((db) => {
        guard(db);
        if (a.time) {
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
        if (a.status === "done" && a.patientId) {
          const p = db.patients.find((x) => x.id === a.patientId);
          if (p && (!p.lastVisitAt || p.lastVisitAt < a.date)) p.lastVisitAt = a.date;
        }
      });
    },
    async setStatus(id: string, status: Appointment["status"]) {
      commit((db) => {
        guard(db);
        const a = db.appointments.find((x) => x.id === id);
        if (!a) return;
        a.status = status;
        if (status === "done" && a.patientId) {
          const p = db.patients.find((x) => x.id === a.patientId);
          if (p && (!p.lastVisitAt || p.lastVisitAt < a.date)) p.lastVisitAt = a.date;
        }
      });
    },
  },

  expenses: {
    async create(e: Omit<Expense, "id">) { commit((db) => { guard(db); db.expenses.push({ ...e, id: uid() }); }); },
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

export function patientStatus(db: Db, p: Patient): "in_treatment" | "open_budget" | "seen" | "new" {
  if (db.treatments.some((t) => t.patientId === p.id && t.clinicalStatus === "in_progress")) return "in_treatment";
  if (db.budgets.some((b) => b.patientId === p.id && b.status === "presented")) return "open_budget";
  if (p.lastVisitAt || db.treatments.some((t) => t.patientId === p.id)) return "seen";
  return "new";
}

export function recallBucket(p: Patient): "30" | "365" | null {
  if (!p.recallEnabled || !p.lastVisitAt) return null;
  const days = Math.floor((Date.now() - new Date(p.lastVisitAt).getTime()) / 86400000);
  if (days >= 365) return "365";
  if (days >= 30) return "30";
  return null;
}

export const isBirthdayMonth = (p: Patient) =>
  !!p.birthDate && Number(p.birthDate.slice(5, 7)) === new Date().getMonth() + 1;

export const nextWeek = () => addDays(todayISO(), 7);
