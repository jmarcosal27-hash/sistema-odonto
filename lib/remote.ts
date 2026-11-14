"use client";

// Camada de dados REAL (Supabase). Mesmas funções e mesmo formato `Db` da
// camada de demonstração, para as telas não mudarem. Toda permissão é checada
// no banco (RLS + RPCs); aqui só montamos as chamadas.
//
// Estratégia: carrega os dados da clínica inteira e recarrega após cada escrita.
// Bom para consultórios e clínicas pequenas; trocar por consultas paginadas
// quando uma clínica passar de alguns milhares de pacientes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Appointment, Budget, Db, Expense, Installment, MessageTemplate, Patient, PatientEvent, PaymentMethod,
  PlanItem, Procedure, Profile, RecallState, RecallStatus, Treatment, TreatmentPlan, WaitlistEntry,
} from "./types";
import { supabaseBrowser } from "./supabase/client";
import { todayISO } from "./format";

export interface Session { userId: string; email: string; clinicId: string; role: "owner" | "dentist" | "receptionist" | "finance"; memberId: string }
export type RemoteState = { status: "loading" } | { status: "no-clinic"; email: string } | { status: "ready"; db: Db; session: Session } | { status: "error"; message: string };

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? undefined : String(v));

function friendly(e: { message?: string; code?: string } | null): Error {
  const m = e?.message ?? "Algo deu errado.";
  if (e?.code === "42501" || /row-level security|permission/i.test(m)) return new Error("Sem permissão para isso — ou o acesso da clínica venceu (modo só leitura).");
  if (e?.code === "23505") return new Error(/cpf/i.test(m) ? "Já existe um paciente com esse CPF." : "Esse registro já existe.");
  if (e?.code === "23514") return new Error("Algum valor está fora do permitido. Confira os campos.");
  return new Error(m);
}

async function q<T>(p: PromiseLike<{ data: T; error: { message: string; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw friendly(error);
  return data;
}

export async function loadRemote(sb: SupabaseClient = supabaseBrowser()): Promise<RemoteState> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { status: "error", message: "Sessão expirada. Entre de novo." };
  await sb.rpc("claim_invites");
  const members = await q(sb.from("clinic_members").select("*").eq("user_id", user.id).eq("status", "active").limit(1));
  const m = (members as Row[])[0];
  if (!m) return { status: "no-clinic", email: user.email ?? "" };
  const c = m.clinic_id as string;
  const by = (t: string) => sb.from(t).select("*").eq("clinic_id", c);

  const [clinic, grants, patients, events, custom, settings, plans, items, budgets, inst, treatments, expenses, appts, templates, waitlist, recall] =
    await Promise.all([
      q(sb.from("clinics").select("*").eq("id", c).single()), q(by("access_grants").order("expires_at", { ascending: false })),
      q(by("patients")), q(by("patient_events")), q(by("custom_procedures")), q(by("procedure_settings")),
      q(by("treatment_plans")), q(by("plan_items").order("position")), q(by("budgets")), q(by("installments")),
      q(by("treatments")), m.role === "owner" || m.role === "finance" ? q(by("expenses")) : Promise.resolve([]),
      q(by("appointments")), q(by("message_templates")), q(by("waitlist_entries")), q(by("recall_states")),
    ]);
  const cl = clinic as Row;
  const g = (grants as Row[])[0];
  const itemsByPlan = new Map<string, PlanItem[]>();
  for (const r of items as Row[]) {
    const list = itemsByPlan.get(r.plan_id as string) ?? [];
    list.push({
      id: r.id as string, tooth: (r.tooth_fdi as number) ?? undefined, region: (r.region as PlanItem["region"]) ?? undefined,
      conditions: (r.conditions as PlanItem["conditions"]) ?? [], procedureId: s(r.procedure_id), procedureName: s(r.procedure_name),
      phase: r.phase as PlanItem["phase"], priceCents: (r.price_cents as number) ?? undefined, quantity: r.quantity as number,
    });
    itemsByPlan.set(r.plan_id as string, list);
  }

  const db: Db = {
    version: 2,
    patients: (patients as Row[]).map((r): Patient => ({
      id: r.id as string, fullName: r.full_name as string, birthDate: s(r.birth_date), sex: (r.sex as Patient["sex"]) ?? undefined,
      cpf: s(r.cpf), phone: s(r.phone), email: s(r.email), address: (r.address as Patient["address"]) ?? undefined,
      guardian: (r.guardian as Patient["guardian"]) ?? undefined, referralSource: s(r.referral_source), notes: s(r.notes),
      recallEnabled: r.recall_enabled as boolean, archived: !!r.archived_at || undefined, lastVisitAt: s(r.last_visit_at), createdAt: r.created_at as string,
    })),
    events: (events as Row[]).map((r): PatientEvent => ({ id: r.id as string, patientId: r.patient_id as string, kind: r.kind as PatientEvent["kind"], label: r.label as string, createdAt: r.created_at as string })),
    customProcedures: (custom as Row[]).map((r): Procedure => ({ id: r.id as string, specialtyId: r.specialty_id as string, group: "Meus procedimentos", name: r.name as string, custom: true })),
    prices: Object.fromEntries((settings as Row[]).filter((r) => r.price_cents !== null).map((r) => [r.procedure_id as string, r.price_cents as number])),
    recallMonths: Object.fromEntries((settings as Row[]).filter((r) => r.recall_months !== null).map((r) => [r.procedure_id as string, r.recall_months as number])),
    plans: (plans as Row[]).map((r): TreatmentPlan => ({
      id: r.id as string, patientId: r.patient_id as string, kind: r.kind as TreatmentPlan["kind"], validityDays: r.validity_days as number,
      items: itemsByPlan.get(r.id as string) ?? [], discountCents: r.discount_cents as number, paymentMethods: r.payment_methods as PaymentMethod[],
      notes: s(r.notes), status: r.status as TreatmentPlan["status"], createdAt: r.created_at as string,
    })),
    budgets: (budgets as Row[]).map((r): Budget => ({
      id: r.id as string, planId: r.plan_id as string, patientId: r.patient_id as string, subtotalCents: r.subtotal_cents as number,
      discountCents: r.discount_cents as number, totalCents: r.total_cents as number, status: r.status as Budget["status"],
      authorizedItemIds: r.authorized_item_ids as string[], presentedAt: r.presented_at as string, authorizedAt: s(r.authorized_at),
    })),
    installments: (inst as Row[]).map((r): Installment => ({
      id: r.id as string, budgetId: r.budget_id as string, patientId: r.patient_id as string, number: r.number as number, of: r.of_total as number,
      dueDate: r.due_date as string, amountCents: r.amount_cents as number, method: (r.method as PaymentMethod) ?? undefined, paidAt: s(r.paid_at),
    })),
    treatments: (treatments as Row[]).map((r): Treatment => ({
      id: r.id as string, patientId: r.patient_id as string, budgetId: s(r.budget_id), planItemId: s(r.plan_item_id), procedureId: s(r.procedure_id),
      procedureName: r.procedure_name as string, performedAt: r.performed_at as string, priceCents: r.price_cents as number,
      paymentStatus: r.payment_status as Treatment["paymentStatus"], clinicalStatus: r.clinical_status as Treatment["clinicalStatus"], createdAt: r.created_at as string,
    })),
    expenses: (expenses as Row[]).map((r): Expense => ({
      id: r.id as string, category: r.category as string, description: s(r.description), amountCents: r.amount_cents as number,
      spentAt: r.spent_at as string, recurring: r.recurring as boolean, paid: r.paid as boolean,
    })),
    appointments: (appts as Row[]).map((r): Appointment => ({
      id: r.id as string, patientId: s(r.patient_id), title: s(r.title), kind: r.kind as Appointment["kind"], date: r.date as string,
      time: r.time ? String(r.time).slice(0, 5) : undefined, durationMinutes: r.duration_minutes as number,
      status: r.status as Appointment["status"], notes: s(r.notes),
    })),
    templates: (templates as Row[]).map((r): MessageTemplate => ({ kind: r.kind as MessageTemplate["kind"], body: r.body as string })),
    waitlist: (waitlist as Row[]).map((r): WaitlistEntry => ({
      id: r.id as string, patientId: r.patient_id as string, period: r.period as WaitlistEntry["period"], notes: s(r.notes),
      status: r.status as WaitlistEntry["status"], createdAt: r.created_at as string,
    })),
    recall: Object.fromEntries((recall as Row[]).map((r) => [r.patient_id as string, { status: r.status as RecallStatus, dueAt: r.due_at as string, updatedAt: r.updated_at as string } satisfies RecallState])),
    profile: {
      professionalName: s(m.professional_name), cro: s(m.cro), workMode: cl.work_mode as Profile["workMode"], contact: s(cl.contact),
      pdfColor: s(cl.pdf_color), theme: m.theme as Profile["theme"], activeSpecialtyIds: cl.active_specialty_ids as string[],
      onboardingDone: cl.onboarding_done as boolean, clinicName: cl.name as string,
    },
    access: {
      plan: (g?.plan as string) ?? "—", startsAt: (g?.starts_at as string) ?? new Date().toISOString(),
      expiresAt: (g?.expires_at as string) ?? new Date(0).toISOString(), email: user.email ?? "",
    },
  };
  return { status: "ready", db, session: { userId: user.id, email: user.email ?? "", clinicId: c, role: m.role as Session["role"], memberId: m.id as string } };
}

/** Funções de escrita. `ctx()` dá cliente, sessão e cache atuais; `refresh()` recarrega depois. */
export function makeRemoteApi(ctx: () => { sb: SupabaseClient; session: Session; db: Db }, refresh: () => Promise<void>) {
  const run = async <T>(fn: () => Promise<T>) => { const r = await fn(); await refresh(); return r; };
  const ev = (patientId: string, kind: PatientEvent["kind"], label: string) => {
    const { sb, session } = ctx();
    return q(sb.from("patient_events").insert({ clinic_id: session.clinicId, patient_id: patientId, kind, label }));
  };
  const touchVisit = async (patientId: string | undefined, date: string) => {
    if (!patientId) return;
    const { sb, db } = ctx();
    const p = db.patients.find((x) => x.id === patientId);
    if (p && (!p.lastVisitAt || p.lastVisitAt.slice(0, 10) < date)) await q(sb.from("patients").update({ last_visit_at: date }).eq("id", patientId));
    await q(sb.from("recall_states").delete().eq("patient_id", patientId));
  };
  const patientRow = (p: Partial<Patient>) => {
    const out: Row = {};
    const map: [keyof Patient, string][] = [["fullName", "full_name"], ["birthDate", "birth_date"], ["sex", "sex"], ["cpf", "cpf"], ["phone", "phone"],
      ["email", "email"], ["address", "address"], ["guardian", "guardian"], ["referralSource", "referral_source"], ["notes", "notes"], ["recallEnabled", "recall_enabled"]];
    for (const [k, col] of map) if (k in p) out[col] = p[k] ?? null;
    return out;
  };

  return {
    patients: {
      create: (input: Partial<Patient>) => run(async () => {
        const { sb, session } = ctx();
        const row = (await q(sb.from("patients").insert({ ...patientRow(input), clinic_id: session.clinicId }).select("id").single())) as Row;
        await ev(row.id as string, "created", "Cadastro criado");
        return row.id as string;
      }),
      update: (id: string, patch: Partial<Patient>) => run(async () => { await q(ctx().sb.from("patients").update(patientRow(patch)).eq("id", id)); }),
      archive: (id: string, archived: boolean) => run(async () => { await q(ctx().sb.from("patients").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id)); }),
      importRows: (rows: Partial<Patient>[]) => run(async () => {
        const { sb, session, db } = ctx();
        const errors: string[] = []; const ok: Row[] = [];
        rows.forEach((r, i) => {
          if (!r.fullName?.trim()) return errors.push(`Linha ${i + 2}: sem nome`);
          if (r.cpf && db.patients.some((p) => p.cpf === r.cpf)) return errors.push(`Linha ${i + 2}: CPF já cadastrado`);
          ok.push({ ...patientRow({ ...r, fullName: r.fullName.trim() }), clinic_id: session.clinicId });
        });
        for (let i = 0; i < ok.length; i += 500) await q(sb.from("patients").insert(ok.slice(i, i + 500)));
        return { created: ok.length, errors };
      }),
    },

    /** Plano + itens + orçamento numa única transação (RPC create_budget). */
    plans: {
      saveAsBudget: (planJson: string) => run(async () => {
        const { sb, session } = ctx();
        const p = JSON.parse(planJson) as Omit<TreatmentPlan, "id" | "createdAt" | "status">;
        return (await q(sb.rpc("create_budget", {
          p_clinic: session.clinicId, p_patient: p.patientId, p_kind: p.kind, p_validity: p.validityDays,
          p_discount: p.discountCents ?? 0, p_methods: p.paymentMethods ?? [], p_notes: p.notes ?? null,
          p_items: p.items.map((i) => ({ tooth: i.tooth ?? null, region: i.region ?? null, conditions: i.conditions, procedure_id: i.procedureId ?? null,
            procedure_name: i.procedureName ?? null, phase: i.phase, price_cents: i.priceCents ?? null, quantity: i.quantity ?? 1 })),
        }))) as string;
      }),
    },

    budgets: {
      authorize: (budgetId: string, itemIds: string[] | undefined, payment: { installments: number; firstDue: string; method?: PaymentMethod; paidNow?: boolean }) => run(async () => {
        const { sb, db } = ctx();
        const b = db.budgets.find((x) => x.id === budgetId);
        const plan = b && db.plans.find((p) => p.id === b.planId);
        await q(sb.rpc("authorize_budget", {
          p_budget: budgetId, p_item_ids: itemIds ?? plan?.items.map((i) => i.id) ?? [], p_installments: payment.installments,
          p_first_due: payment.firstDue, p_method: payment.method ?? null, p_paid_now: !!payment.paidNow,
        }));
      }),
      decline: (budgetId: string) => run(async () => { await q(ctx().sb.from("budgets").update({ status: "declined" }).eq("id", budgetId)); }),
    },

    installments: {
      pay: (id: string, method?: PaymentMethod, date = todayISO()) => run(async () => {
        const { sb, db } = ctx();
        await q(sb.from("installments").update({ paid_at: date, ...(method ? { method } : {}) }).eq("id", id));
        const i = db.installments.find((x) => x.id === id);
        if (i) await ev(i.patientId, "payment_received", `Parcela ${i.number}/${i.of} recebida`);
      }),
      unpay: (id: string) => run(async () => { await q(ctx().sb.from("installments").update({ paid_at: null }).eq("id", id)); }),
    },

    treatments: {
      log: (input: Omit<Treatment, "id" | "createdAt"> & { nextAppointmentDate?: string }) => run(async () => {
        const { sb, session } = ctx();
        const { nextAppointmentDate, ...t } = input;
        await q(sb.from("treatments").insert({
          clinic_id: session.clinicId, patient_id: t.patientId, dentist_id: session.userId, procedure_id: t.procedureId ?? null,
          procedure_name: t.procedureName, performed_at: t.performedAt, price_cents: t.priceCents, payment_status: t.paymentStatus, clinical_status: t.clinicalStatus,
        }));
        await touchVisit(t.patientId, t.performedAt);
        await ev(t.patientId, "treatment_done", `${t.procedureName} realizado`);
        if (t.paymentStatus === "received") await ev(t.patientId, "payment_received", "Pagamento registrado");
        if (nextAppointmentDate) {
          await q(sb.from("appointments").insert({ clinic_id: session.clinicId, patient_id: t.patientId, dentist_id: session.userId, kind: "return", date: nextAppointmentDate, duration_minutes: 30 }));
          await ev(t.patientId, "appointment_scheduled", "Retorno agendado");
        }
      }),
      update: (id: string, patch: Partial<Treatment>) => run(async () => {
        const { sb, db } = ctx();
        const t = db.treatments.find((x) => x.id === id);
        const row: Row = {};
        if (patch.paymentStatus) row.payment_status = patch.paymentStatus;
        if (patch.clinicalStatus) row.clinical_status = patch.clinicalStatus;
        if (patch.performedAt) row.performed_at = patch.performedAt;
        await q(sb.from("treatments").update(row).eq("id", id));
        if (t && patch.clinicalStatus === "done") await touchVisit(t.patientId, todayISO());
        if (t && t.paymentStatus === "pending" && patch.paymentStatus === "received") await ev(t.patientId, "payment_received", `Recebido: ${t.procedureName}`);
      }),
    },

    appointments: {
      save: (a: Omit<Appointment, "id"> & { id?: string }) => run(async () => {
        const { sb, session, db } = ctx();
        if (a.time && a.status !== "cancelled") {
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          const start = toMin(a.time), end = start + a.durationMinutes;
          const clash = db.appointments.find((x) => x.id !== a.id && x.date === a.date && x.time && x.status !== "cancelled" && toMin(x.time) < end && start < toMin(x.time) + x.durationMinutes);
          if (clash) throw new Error(`Esse horário bate com outro compromisso às ${clash.time}.`);
        }
        const row = { patient_id: a.patientId ?? null, title: a.title ?? null, kind: a.kind, date: a.date, time: a.time ?? null,
          duration_minutes: a.durationMinutes, status: a.status, notes: a.notes ?? null };
        if (a.id) await q(sb.from("appointments").update(row).eq("id", a.id));
        else {
          await q(sb.from("appointments").insert({ ...row, clinic_id: session.clinicId, dentist_id: session.userId }));
          if (a.patientId) await ev(a.patientId, "appointment_scheduled", "Compromisso marcado");
        }
        if (a.patientId && a.status !== "cancelled" && a.date >= todayISO()) {
          await q(sb.from("waitlist_entries").update({ status: "placed" }).eq("patient_id", a.patientId).in("status", ["waiting", "contacted"]));
        }
        if (a.status === "done") await touchVisit(a.patientId, a.date);
      }),
      setStatus: (id: string, status: Appointment["status"]) => run(async () => {
        const { sb, db } = ctx();
        await q(sb.from("appointments").update({ status }).eq("id", id));
        const a = db.appointments.find((x) => x.id === id);
        if (a && status === "done") await touchVisit(a.patientId, a.date);
      }),
    },

    waitlist: {
      add: (e: Omit<WaitlistEntry, "id" | "createdAt" | "status">) => run(async () => {
        const { sb, session, db } = ctx();
        if (db.waitlist.some((x) => x.patientId === e.patientId && (x.status === "waiting" || x.status === "contacted"))) throw new Error("Esse paciente já está na lista de espera.");
        await q(sb.from("waitlist_entries").insert({ clinic_id: session.clinicId, patient_id: e.patientId, period: e.period, notes: e.notes ?? null }));
      }),
      setStatus: (id: string, status: WaitlistEntry["status"]) => run(async () => { await q(ctx().sb.from("waitlist_entries").update({ status }).eq("id", id)); }),
    },

    recall: {
      setStatus: (patientId: string, status: RecallStatus, dueAt: string) => run(async () => {
        const { sb, session } = ctx();
        await q(sb.from("recall_states").upsert({ clinic_id: session.clinicId, patient_id: patientId, status, due_at: dueAt, updated_at: new Date().toISOString() }));
      }),
    },

    expenses: {
      create: (e: Omit<Expense, "id">) => run(async () => {
        await q(ctx().sb.from("expenses").insert({ clinic_id: ctx().session.clinicId, category: e.category, description: e.description ?? null,
          amount_cents: e.amountCents, spent_at: e.spentAt, recurring: e.recurring, paid: e.paid ?? true }));
      }),
      setPaid: (id: string, paid: boolean) => run(async () => { await q(ctx().sb.from("expenses").update({ paid }).eq("id", id)); }),
      remove: (id: string) => run(async () => { await q(ctx().sb.from("expenses").delete().eq("id", id)); }),
    },

    catalog: {
      createCustomProcedure: (name: string, specialtyId: string) => run(async () => {
        const row = (await q(ctx().sb.from("custom_procedures").insert({ clinic_id: ctx().session.clinicId, name, specialty_id: specialtyId }).select("id").single())) as Row;
        return row.id as string;
      }),
      setPrice: (procedureId: string, cents: number | undefined) => run(async () => {
        const { sb, session, db } = ctx();
        await q(sb.from("procedure_settings").upsert({ clinic_id: session.clinicId, procedure_id: procedureId, price_cents: cents ?? null, recall_months: db.recallMonths[procedureId] ?? null }));
      }),
      setRecallMonths: (procedureId: string, months: number | undefined) => run(async () => {
        const { sb, session, db } = ctx();
        await q(sb.from("procedure_settings").upsert({ clinic_id: session.clinicId, procedure_id: procedureId, recall_months: months ?? null, price_cents: db.prices[procedureId] ?? null }));
      }),
      adjustAllPrices: (percent: number) => run(async () => {
        const { sb, session, db } = ctx();
        const rows = Object.entries(db.prices).map(([id, cents]) => ({ clinic_id: session.clinicId, procedure_id: id, price_cents: Math.round(cents * (1 + percent / 100)), recall_months: db.recallMonths[id] ?? null }));
        if (rows.length) await q(sb.from("procedure_settings").upsert(rows));
      }),
    },

    account: {
      updateProfile: (patch: Partial<Profile>) => run(async () => {
        const { sb, session } = ctx();
        const member: Row = {}, clinic: Row = {};
        if ("professionalName" in patch) member.professional_name = patch.professionalName ?? null;
        if ("cro" in patch) member.cro = patch.cro ?? null;
        if ("theme" in patch) member.theme = patch.theme;
        if ("workMode" in patch) clinic.work_mode = patch.workMode;
        if ("contact" in patch) clinic.contact = patch.contact ?? null;
        if ("pdfColor" in patch) clinic.pdf_color = patch.pdfColor ?? null;
        if ("activeSpecialtyIds" in patch) clinic.active_specialty_ids = patch.activeSpecialtyIds;
        if ("onboardingDone" in patch) clinic.onboarding_done = patch.onboardingDone;
        if ("clinicName" in patch) clinic.name = patch.clinicName;
        if (Object.keys(member).length) await q(sb.from("clinic_members").update(member).eq("id", session.memberId));
        if (Object.keys(clinic).length) {
          if (session.role !== "owner") throw new Error("Só o dono da clínica muda esses ajustes.");
          await q(sb.from("clinics").update(clinic).eq("id", session.clinicId));
        }
      }),
      updateTemplate: (t: MessageTemplate) => run(async () => {
        await q(ctx().sb.from("message_templates").upsert({ clinic_id: ctx().session.clinicId, kind: t.kind, body: t.body }));
      }),
    },
  };
}
