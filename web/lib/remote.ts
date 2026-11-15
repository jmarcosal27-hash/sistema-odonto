"use client";

// Camada de dados REAL (Supabase). Mesmas funções e mesmo formato `Db` da
// camada de demonstração, para as telas não mudarem. Toda permissão é checada
// no banco (RLS + RPCs); aqui só montamos as chamadas.
//
// Estratégia: carrega os dados da clínica inteira (em páginas de 1000 linhas, pois o
// PostgREST corta em 1000 por consulta) e recarrega após cada escrita. Bom para
// consultórios e clínicas pequenas; trocar por consultas por tela quando uma clínica
// passar de alguns milhares de pacientes.

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnamnesisAnswer, AnamnesisQuestion, AnamnesisRecord, AnamnesisTemplate, Certificate, ClinicalNote, CustomDocument, Medication, PatientFile, Prescription, PrescriptionItem, PrescriptionTemplate,
  Appointment, Budget, Db, Expense, Installment, MessageTemplate, Patient, PatientEvent, PaymentMethod,
  PlanItem, Procedure, Profile, RecallState, RecallStatus, Treatment, TreatmentPlan, WaitlistEntry,
  Opportunity, OpportunityEvent, SalesStage, Laboratory, ProsthesisEvent, ProsthesisJob, Professional, TimeBlock, AppointmentProcedure,
} from "./types";
import { MAX_COMMENT } from "./types";
import { supabaseBrowser } from "./supabase/client";
import { todayISO } from "./format";
import { hasUnanswered } from "./catalog";
import { normalizeJob, normalizeLab, type JobInput } from "./prosthesis";
import { checkHofItem } from "./hof";
import { MAX_BLOCK_DAYS, prepareAppointment, toMin } from "./agenda";
import { EXT, MAX_FILE_BYTES, checkFile } from "./files";

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

/** No banco os procedimentos do agendamento usam snake_case (jsonb validado por CHECK). */
function mapProcedures(v: unknown): AppointmentProcedure[] | undefined {
  if (!Array.isArray(v) || !v.length) return undefined;
  return v.map((p: Row) => ({ name: p.name as string, priceCents: p.price_cents as number, durationMinutes: p.duration_minutes as number, procedureId: s(p.procedure_id) }));
}

const PAGE = 1000;
const NO_ROWS = "Sem permissão para isso, ou o item já não existe. Só o dono ou quem criou pode alterar ou excluir.";

/** Lê todas as linhas da clínica numa tabela, página por página, com ordem estável. */
async function loadAll(sb: SupabaseClient, table: string, clinicId: string, order: [string, boolean][] = [["id", true]]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = sb.from(table).select("*").eq("clinic_id", clinicId);
    const ordered = order.reduce((b, [col, asc]) => b.order(col, { ascending: asc }), base);
    const { data, error } = await ordered.range(from, from + PAGE - 1);
    if (error) throw friendly(error);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

export async function loadRemote(sb: SupabaseClient = supabaseBrowser()): Promise<RemoteState> {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { status: "error", message: "Sessão expirada. Entre de novo." };
  const { error: claimError } = await sb.rpc("claim_invites");
  if (claimError) return { status: "error", message: friendly(claimError).message };
  const members = await q(sb.from("clinic_members").select("*").eq("user_id", user.id).eq("status", "active").limit(1));
  const m = (members as Row[])[0];
  if (!m) return { status: "no-clinic", email: user.email ?? "" };
  const c = m.clinic_id as string;
  const by = (t: string, order?: [string, boolean][]) => loadAll(sb, t, c, order);

  // Funil de vendas: se a migration de vendas ainda não foi aplicada, o resto do app segue funcionando e /vendas avisa.
  const optional = (t: string, order?: [string, boolean][]) => by(t, order).catch(() => [] as Row[]);

  const [clinic, grants, patients, events, custom, settings, plans, items, budgets, inst, treatments, expenses, appts, templates, waitlist, recall, notes, anaTemplates, anaRecords, meds, rxs, rxItems, rxTemplates, certs, customDocs, files, stages, opps, oppEvents, goals, labs, pjobs, pevents, pros, tblocks] =
    await Promise.all([
      q(sb.from("clinics").select("*").eq("id", c).single()), by("access_grants", [["expires_at", false], ["id", true]]),
      by("patients"), by("patient_events"), by("custom_procedures"), by("procedure_settings", [["procedure_id", true]]),
      by("treatment_plans"), by("plan_items", [["position", true], ["id", true]]), by("budgets"), by("installments"),
      by("treatments"), m.role === "owner" || m.role === "finance" ? by("expenses") : Promise.resolve([] as Row[]),
      by("appointments"), by("message_templates", [["kind", true]]), by("waitlist_entries"), by("recall_states", [["patient_id", true]]),
      by("clinical_notes", [["note_date", false], ["id", true]]), by("anamnesis_templates", [["created_at", true], ["id", true]]),
      by("anamnesis_records", [["filled_on", false], ["id", true]]),
      by("medications", [["name", true], ["id", true]]), by("prescriptions", [["issued_on", false], ["id", true]]),
      by("prescription_items", [["position", true], ["id", true]]), by("prescription_templates", [["name", true], ["id", true]]),
      by("certificates", [["issued_on", false], ["id", true]]),
      by("custom_documents", [["issued_on", false], ["id", true]]), by("patient_files", [["created_at", false], ["id", true]]),
      optional("sales_stages", [["position", true], ["id", true]]), optional("opportunities", [["created_at", false], ["id", true]]),
      optional("opportunity_events", [["created_at", true], ["id", true]]), optional("sales_goals", [["month", true]]),
      optional("laboratories", [["name", true], ["id", true]]), optional("prosthesis_jobs", [["created_at", false], ["id", true]]),
      optional("prosthesis_events", [["created_at", true], ["id", true]]),
      optional("professionals", [["name", true], ["id", true]]), optional("time_blocks", [["date", true], ["start_time", true], ["id", true]]),
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
      ...(r.hof ? {
        hof: true, hofFace: (r.hof_face as PlanItem["hofFace"]) ?? undefined, hofRegions: (r.hof_regions as string[]) ?? [],
        hofMarks: (r.hof_marks as PlanItem["hofMarks"]) ?? [], productAmount: r.product_amount === null ? undefined : Number(r.product_amount),
        productUnit: (r.product_unit as PlanItem["productUnit"]) ?? undefined, dentistName: s(r.dentist_name),
      } : {}),
    });
    itemsByPlan.set(r.plan_id as string, list);
  }

  const rxItemsBy = new Map<string, PrescriptionItem[]>();
  for (const r of rxItems as Row[]) {
    const list = rxItemsBy.get(r.prescription_id as string) ?? [];
    list.push({
      id: r.id as string, medicationId: s(r.medication_id), name: r.name as string, quantity: r.quantity === null ? undefined : Number(r.quantity),
      unit: s(r.unit), posology: r.posology as string, route: r.route as PrescriptionItem["route"], controlled: r.controlled as boolean,
    });
    rxItemsBy.set(r.prescription_id as string, list);
  }
  const snap = (r: Row) => ({ professionalName: s(r.professional_name), professionalCro: s(r.professional_cro), professionalCroUf: s(r.professional_cro_uf) });

  const db: Db = {
    version: 10,
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
      professionalId: s(r.professional_id), procedures: mapProcedures(r.procedures), label: s(r.label), forced: r.forced ? true : undefined,
    })),
    professionals: (pros as Row[]).map((r): Professional => ({ id: r.id as string, name: r.name as string, color: r.color as string, active: r.active as boolean })),
    timeBlocks: (tblocks as Row[]).map((r): TimeBlock => ({
      id: r.id as string, professionalId: s(r.professional_id), date: r.date as string,
      startTime: String(r.start_time).slice(0, 5), endTime: String(r.end_time).slice(0, 5), reason: r.reason as string,
    })),
    templates: (templates as Row[]).map((r): MessageTemplate => ({ kind: r.kind as MessageTemplate["kind"], body: r.body as string })),
    waitlist: (waitlist as Row[]).map((r): WaitlistEntry => ({
      id: r.id as string, patientId: r.patient_id as string, period: r.period as WaitlistEntry["period"], notes: s(r.notes),
      status: r.status as WaitlistEntry["status"], createdAt: r.created_at as string,
    })),
    recall: Object.fromEntries((recall as Row[]).map((r) => [r.patient_id as string, { status: r.status as RecallStatus, dueAt: r.due_at as string, updatedAt: r.updated_at as string } satisfies RecallState])),
    clinicalNotes: (notes as Row[]).map((r): ClinicalNote => ({
      id: r.id as string, patientId: r.patient_id as string, treatmentId: s(r.treatment_id), date: r.note_date as string,
      body: r.body as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    })),
    anamnesisTemplates: (anaTemplates as Row[]).map((r): AnamnesisTemplate => ({
      id: r.id as string, name: r.name as string, questions: r.questions as AnamnesisQuestion[], createdAt: r.created_at as string,
    })),
    anamnesisRecords: (anaRecords as Row[]).map((r): AnamnesisRecord => ({
      id: r.id as string, patientId: r.patient_id as string, templateId: s(r.template_id), templateName: r.template_name as string,
      answers: r.answers as AnamnesisAnswer[], filledOn: r.filled_on as string, createdAt: r.created_at as string,
      status: r.status as AnamnesisRecord["status"], revisionOf: s(r.revision_of), completedAt: s(r.completed_at), completedBy: s(r.completed_by),
    })),
    medications: (meds as Row[]).map((r): Medication => ({
      id: r.id as string, name: r.name as string, route: r.route as Medication["route"], controlled: r.controlled as boolean,
      unit: s(r.unit), defaultPosology: s(r.default_posology), createdAt: r.created_at as string,
    })),
    prescriptions: (rxs as Row[]).map((r): Prescription => ({
      id: r.id as string, patientId: r.patient_id as string, ...snap(r), issuedOn: r.issued_on as string, notes: s(r.notes),
      items: rxItemsBy.get(r.id as string) ?? [], createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    })),
    prescriptionTemplates: (rxTemplates as Row[]).map((r): PrescriptionTemplate => ({
      id: r.id as string, name: r.name as string, items: r.items as PrescriptionTemplate["items"], createdAt: r.created_at as string,
    })),
    certificates: (certs as Row[]).map((r): Certificate => ({
      id: r.id as string, patientId: r.patient_id as string, ...snap(r), issuedOn: r.issued_on as string, startsOn: r.starts_on as string,
      kind: r.kind as Certificate["kind"], amount: r.amount as number, cid: s(r.cid), cidConsent: r.cid_consent as boolean,
      purpose: s(r.purpose), createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    })),
    customDocuments: (customDocs as Row[]).map((r): CustomDocument => ({
      id: r.id as string, patientId: r.patient_id as string, ...snap(r), title: r.title as string, body: r.body as string,
      issuedOn: r.issued_on as string, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    })),
    patientFiles: (files as Row[]).map((r): PatientFile => ({
      id: r.id as string, patientId: r.patient_id as string, name: r.name as string, mime: r.mime as PatientFile["mime"],
      sizeBytes: r.size_bytes as number, createdAt: r.created_at as string,
    })),
    salesStages: (stages as Row[]).map((r): SalesStage => ({ id: r.id as string, name: r.name as string, position: r.position as number, kind: (r.kind as SalesStage["kind"]) ?? undefined })),
    opportunities: (opps as Row[]).map((r): Opportunity => ({
      id: r.id as string, patientId: r.patient_id as string, stageId: r.stage_id as string, budgetId: s(r.budget_id), title: r.title as string,
      valueCents: r.value_cents as number, responsible: s(r.responsible_name), label: s(r.label),
      createdAt: r.created_at as string, updatedAt: r.updated_at as string, stageChangedAt: r.stage_changed_at as string,
    })),
    opportunityEvents: (oppEvents as Row[]).map((r): OpportunityEvent => ({
      id: r.id as string, opportunityId: r.opportunity_id as string, kind: r.kind as OpportunityEvent["kind"], body: r.body as string,
      authorName: s(r.author_name), createdAt: r.created_at as string,
    })),
    salesGoals: Object.fromEntries((goals as Row[]).map((r) => [String(r.month).slice(0, 7), r.goal_cents as number])),
    laboratories: (labs as Row[]).map((r): Laboratory => ({ id: r.id as string, name: r.name as string, phone: s(r.phone), notes: s(r.notes) })),
    prosthesisJobs: (pjobs as Row[]).map((r): ProsthesisJob => ({
      id: r.id as string, patientId: r.patient_id as string, stage: r.stage as ProsthesisJob["stage"], professional: r.professional_name as string,
      description: r.description as string, kind: r.kind as ProsthesisJob["kind"], teeth: s(r.teeth), shade: s(r.shade), laboratoryId: s(r.laboratory_id),
      sentOn: s(r.sent_on), dueOn: s(r.due_on), costCents: r.cost_cents === null ? undefined : Number(r.cost_cents), notes: s(r.notes), label: s(r.label),
      isReturn: r.is_return as boolean, returnReason: s(r.return_reason), createdAt: r.created_at as string, updatedAt: r.updated_at as string, stageChangedAt: r.stage_changed_at as string,
    })),
    prosthesisEvents: (pevents as Row[]).map((r): ProsthesisEvent => ({
      id: r.id as string, jobId: r.job_id as string, kind: r.kind as ProsthesisEvent["kind"], body: r.body as string, authorName: s(r.author_name), createdAt: r.created_at as string,
    })),
    profile: {
      logo: s(cl.logo_data), professionalName: s(m.professional_name), cro: s(m.cro), croUf: s(m.cro_uf), cpf: s(m.cpf), birthDate: s(m.birth_date), workMode: cl.work_mode as Profile["workMode"], contact: s(cl.contact),
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

  // paciente e etapa não mudam por aqui: o banco recusa troca de paciente e a etapa muda só por moveJob
  const jobRow = (f: ReturnType<typeof normalizeJob>) => ({
    patient_id: f.patientId, professional_name: f.professional, description: f.description, kind: f.kind, teeth: f.teeth ?? null, shade: f.shade ?? null,
    laboratory_id: f.laboratoryId ?? null, sent_on: f.sentOn ?? null, due_on: f.dueOn ?? null, cost_cents: f.costCents ?? null, notes: f.notes ?? null,
    label: f.label ?? null, is_return: f.isReturn, return_reason: f.returnReason ?? null,
  });

  return {
    patients: {
      create: (input: Partial<Patient>) => run(async () => {
        const { sb, session } = ctx();
        // Responsável = quem cadastra (dono/dentista). O banco reforça isso para dentistas.
        const dentist = session.role === "dentist" || session.role === "owner" ? { dentist_id: session.userId } : {};
        const row = (await q(sb.from("patients").insert({ ...patientRow(input), ...dentist, clinic_id: session.clinicId }).select("id").single())) as Row;
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
          ok.push({ ...patientRow({ ...r, fullName: r.fullName.trim() }), clinic_id: session.clinicId,
            ...(session.role === "dentist" || session.role === "owner" ? { dentist_id: session.userId } : {}) });
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
          p_items: p.items.map(checkHofItem).map((i) => ({ tooth: i.tooth ?? null, region: i.region ?? null, conditions: i.conditions, procedure_id: i.procedureId ?? null,
            procedure_name: i.procedureName ?? null, phase: i.phase, price_cents: i.priceCents ?? null, quantity: i.quantity ?? 1,
            ...(i.hof ? { hof: true, hof_face: i.hofFace, hof_regions: i.hofRegions, hof_marks: i.hofMarks, product_amount: i.productAmount ?? null,
              product_unit: i.productUnit ?? null, dentist_name: i.dentistName ?? null } : {}) })),
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
      decline: (budgetId: string) => run(async () => { await q(ctx().sb.rpc("decline_budget", { p_budget: budgetId })); }),
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
      save: (input: Omit<Appointment, "id"> & { id?: string }) => run(async () => {
        const { sb, session, db } = ctx();
        const a = prepareAppointment(db, input);
        const row = { patient_id: a.patientId ?? null, title: a.title ?? null, kind: a.kind, date: a.date, time: a.time ?? null,
          duration_minutes: a.durationMinutes, status: a.status, notes: a.notes ?? null,
          professional_id: a.professionalId ?? null, label: a.label ?? null, forced: !!a.forced,
          procedures: (a.procedures ?? []).map((p) => ({ name: p.name, price_cents: p.priceCents, duration_minutes: p.durationMinutes, ...(p.procedureId ? { procedure_id: p.procedureId } : {}) })) };
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

    professionals: {
      save: (p: { id?: string; name: string; color: string; active: boolean }) => run(async () => {
        const { sb, session } = ctx();
        const name = p.name.trim();
        if (!name) throw new Error("Dê um nome ao profissional.");
        const row = { name, color: p.color, active: p.active };
        if (p.id) {
          const rows = await q(sb.from("professionals").update(row).eq("id", p.id).select("id"));
          if (!rows?.length) throw new Error("Sem permissão para isso. Só o dono da clínica gerencia os profissionais.");
        } else await q(sb.from("professionals").insert({ ...row, clinic_id: session.clinicId }));
      }),
      remove: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("professionals").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error("Sem permissão para isso. Só o dono da clínica gerencia os profissionais.");
      }),
    },

    timeBlocks: {
      create: (b: { professionalId?: string; dates: string[]; startTime: string; endTime: string; reason: string }) => run(async () => {
        const { sb, session } = ctx();
        const reason = b.reason.trim() || "Bloqueio";
        if (!b.startTime || !b.endTime || toMin(b.endTime) <= toMin(b.startTime)) throw new Error("O fim precisa ser depois do início.");
        if (!b.dates.length || b.dates.length > MAX_BLOCK_DAYS) throw new Error(`Escolha de 1 a ${MAX_BLOCK_DAYS} dias.`);
        await q(sb.from("time_blocks").insert(b.dates.map((date) => ({ clinic_id: session.clinicId, professional_id: b.professionalId ?? null, date, start_time: b.startTime, end_time: b.endTime, reason }))));
      }),
      remove: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("time_blocks").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
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

    // Criar e mover oportunidade por orçamento é feito por gatilhos no banco; aqui só o que a pessoa faz no funil.
    // O histórico de mudança de etapa também é gravado pelo banco (gatilho em opportunities).
    sales: {
      createOpportunity: (o: { patientId: string; title: string; valueCents: number; responsible?: string }) => run(async () => {
        const { sb, session, db } = ctx();
        const title = o.title.trim();
        if (!title) throw new Error("Dê um título à oportunidade.");
        const stage = db.salesStages.find((x) => x.kind === "open");
        if (!stage) throw new Error("Etapas do funil não encontradas. A atualização do banco de dados (vendas) já foi aplicada?");
        const row = (await q(sb.from("opportunities").insert({ clinic_id: session.clinicId, patient_id: o.patientId, stage_id: stage.id, title,
          value_cents: o.valueCents, responsible_name: o.responsible?.trim() || null }).select("id").single())) as Row;
        return row.id as string;
      }),
      updateOpportunity: (id: string, patch: { title?: string; valueCents?: number; responsible?: string; label?: string }) => run(async () => {
        const row: Row = {};
        if (patch.title !== undefined) row.title = patch.title.trim();
        if (patch.valueCents !== undefined) row.value_cents = patch.valueCents;
        if ("responsible" in patch) row.responsible_name = patch.responsible?.trim() || null;
        if ("label" in patch) row.label = patch.label?.trim() || null;
        const rows = await q(ctx().sb.from("opportunities").update(row).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      moveOpportunity: (id: string, stageId: string) => run(async () => {
        const rows = await q(ctx().sb.from("opportunities").update({ stage_id: stageId }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      addComment: (opportunityId: string, body: string) => run(async () => {
        const { sb, session } = ctx();
        const text = body.trim();
        if (!text) throw new Error("Escreva o comentário.");
        if (text.length > MAX_COMMENT) throw new Error(`O comentário pode ter até ${MAX_COMMENT} caracteres.`);
        await q(sb.from("opportunity_events").insert({ clinic_id: session.clinicId, opportunity_id: opportunityId, kind: "comment", body: text }));
      }),
      createStage: (name: string) => run(async () => {
        const { sb, session, db } = ctx();
        const n = name.trim();
        if (!n) throw new Error("Dê um nome à etapa.");
        await q(sb.from("sales_stages").insert({ clinic_id: session.clinicId, name: n, position: Math.max(-1, ...db.salesStages.map((x) => x.position)) + 1 }));
      }),
      renameStage: (id: string, name: string) => run(async () => {
        const n = name.trim();
        if (!n) throw new Error("Dê um nome à etapa.");
        const rows = await q(ctx().sb.from("sales_stages").update({ name: n }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error("Sem permissão para isso. Só o dono da clínica muda as etapas.");
      }),
      deleteStage: (id: string, moveToId?: string) => run(async () => { await q(ctx().sb.rpc("delete_sales_stage", { p_stage: id, p_move_to: moveToId ?? null })); }),
      setGoal: (month: string, cents: number) => run(async () => {
        const { sb, session } = ctx();
        if (cents === 0) await q(sb.from("sales_goals").delete().eq("clinic_id", session.clinicId).eq("month", `${month}-01`));
        else await q(sb.from("sales_goals").upsert({ clinic_id: session.clinicId, month: `${month}-01`, goal_cents: cents, updated_at: new Date().toISOString() }));
      }),
    },

    // Histórico de etapa e de criação é gravado pelo banco (gatilhos em prosthesis_jobs); aqui só o que a pessoa faz.
    prosthesis: {
      createLab: (input: { name: string; phone?: string; notes?: string }) => run(async () => {
        const { sb, session } = ctx();
        const l = normalizeLab(input);
        const row = (await q(sb.from("laboratories").insert({ clinic_id: session.clinicId, name: l.name, phone: l.phone ?? null, notes: l.notes ?? null }).select("id").single())) as Row;
        return row.id as string;
      }),
      updateLab: (id: string, input: { name: string; phone?: string; notes?: string }) => run(async () => {
        const l = normalizeLab(input);
        const rows = await q(ctx().sb.from("laboratories").update({ name: l.name, phone: l.phone ?? null, notes: l.notes ?? null }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      deleteLab: (id: string) => run(async () => { await q(ctx().sb.from("laboratories").delete().eq("id", id)); }),
      createJob: (input: JobInput) => run(async () => {
        const { sb, session } = ctx();
        const f = normalizeJob(input);
        const row = (await q(sb.from("prosthesis_jobs").insert({ clinic_id: session.clinicId, ...jobRow(f) }).select("id").single())) as Row;
        return row.id as string;
      }),
      updateJob: (id: string, input: JobInput) => run(async () => {
        const rows = await q(ctx().sb.from("prosthesis_jobs").update(jobRow(normalizeJob(input))).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      moveJob: (id: string, stage: ProsthesisJob["stage"]) => run(async () => {
        const rows = await q(ctx().sb.from("prosthesis_jobs").update({ stage }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      addComment: (jobId: string, body: string) => run(async () => {
        const { sb, session } = ctx();
        const t = body.trim();
        if (!t) throw new Error("Escreva o comentário.");
        if (t.length > MAX_COMMENT) throw new Error(`O comentário pode ter até ${MAX_COMMENT} caracteres.`);
        await q(sb.from("prosthesis_events").insert({ clinic_id: session.clinicId, job_id: jobId, kind: "comment", body: t }));
      }),
      deleteJob: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("prosthesis_jobs").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
    },

    clinicalNotes: {
      save: (n: { id?: string; patientId: string; treatmentId?: string; date: string; body: string }) => run(async () => {
        const { sb, session } = ctx();
        const body = n.body.trim();
        if (!body) throw new Error("Escreva a evolução antes de salvar.");
        const row = { treatment_id: n.treatmentId ?? null, note_date: n.date, body, updated_at: new Date().toISOString() };
        if (n.id) await q(sb.from("clinical_notes").update(row).eq("id", n.id));
        else await q(sb.from("clinical_notes").insert({ ...row, clinic_id: session.clinicId, patient_id: n.patientId }));
      }),
      remove: (id: string) => run(async () => { await q(ctx().sb.from("clinical_notes").delete().eq("id", id)); }),
    },

    anamnesis: {
      saveTemplate: (t: { id?: string; name: string; questions: AnamnesisQuestion[] }) => run(async () => {
        const { sb, session } = ctx();
        const name = t.name.trim();
        if (name.length < 2) throw new Error("Dê um nome ao modelo.");
        const questions = t.questions.filter((x) => x.text.trim()).map((x) => ({ ...x, text: x.text.trim() }));
        if (!questions.length) throw new Error("Adicione pelo menos uma pergunta.");
        if (t.id) await q(sb.from("anamnesis_templates").update({ name, questions }).eq("id", t.id));
        else await q(sb.from("anamnesis_templates").insert({ clinic_id: session.clinicId, name, questions }));
      }),
      removeTemplate: (id: string) => run(async () => { await q(ctx().sb.from("anamnesis_templates").delete().eq("id", id)); }),
      /** Cria ou atualiza um rascunho; `complete` conclui (o banco trava a ficha e só dono/dentista concluem). */
      saveRecord: (r: { id?: string; patientId: string; templateId?: string; templateName: string; answers: AnamnesisAnswer[]; filledOn: string; revisionOf?: string; complete?: boolean }) => run(async () => {
        const { sb, session } = ctx();
        if (!r.answers.length) throw new Error("A ficha está vazia.");
        if (r.complete && hasUnanswered(r.answers)) throw new Error("Responda todas as perguntas de sim ou não antes de concluir.");
        const status = r.complete ? "completed" : "draft";
        const body = { template_id: r.templateId ?? null, template_name: r.templateName, answers: r.answers, filled_on: r.filledOn, status };
        if (r.id) {
          const rows = await q(sb.from("anamnesis_records").update(body).eq("id", r.id).select("id"));
          if (!(rows as Row[]).length) throw new Error(NO_ROWS);
        } else {
          await q(sb.from("anamnesis_records").insert({ ...body, clinic_id: session.clinicId, patient_id: r.patientId, revision_of: r.revisionOf ?? null }));
        }
      }),
      removeRecord: (id: string) => run(async () => { await q(ctx().sb.from("anamnesis_records").delete().eq("id", id)); }),
    },

    prescriptions: {
      save: (r: { id?: string; patientId: string; issuedOn: string; notes?: string; items: Omit<PrescriptionItem, "id" | "medicationId">[] }) => run(async () => {
        const { sb, session, db } = ctx();
        const prof = db.profile;
        const items = r.items.map((it) => {
          const med = db.medications.find((m) => m.name.toLowerCase() === it.name.trim().toLowerCase());
          return { medication_id: med?.id ?? null, name: it.name, quantity: it.quantity ?? null, unit: it.unit ?? null, posology: it.posology, route: it.route, controlled: it.controlled };
        });
        await q(sb.rpc("save_prescription", {
          p_id: r.id ?? null, p_clinic: session.clinicId, p_patient: r.patientId, p_issued_on: r.issuedOn, p_notes: r.notes ?? null,
          p_prof_name: prof.professionalName ?? null, p_prof_cro: prof.cro ?? null, p_prof_cro_uf: prof.croUf ?? null, p_items: items,
        }));
      }),
      remove: (id: string) => run(async () => { await q(ctx().sb.from("prescriptions").delete().eq("id", id)); }),
    },

    medications: {
      update: (id: string, m: { name: string; route: Medication["route"]; controlled: boolean; unit?: string; defaultPosology?: string }) => run(async () => {
        const name = m.name.trim();
        if (!name) throw new Error("Informe o nome do medicamento.");
        const rows = await q(ctx().sb.from("medications").update({ name, route: m.route, controlled: m.controlled, unit: m.unit?.trim() || null, default_posology: m.defaultPosology?.trim() || null }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      remove: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("medications").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
    },

    prescriptionTemplates: {
      rename: (id: string, name: string) => run(async () => {
        const n = name.trim();
        if (n.length < 2) throw new Error("Dê um nome ao modelo.");
        const rows = await q(ctx().sb.from("prescription_templates").update({ name: n }).eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      save: (t: { name: string; items: PrescriptionTemplate["items"] }) => run(async () => {
        const { sb, session } = ctx();
        const name = t.name.trim();
        if (name.length < 2) throw new Error("Dê um nome ao modelo.");
        await q(sb.from("prescription_templates").insert({ clinic_id: session.clinicId, name, items: t.items }));
      }),
      remove: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("prescription_templates").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
    },

    certificates: {
      save: (c: { id?: string; patientId: string; issuedOn: string; startsOn: string; kind: Certificate["kind"]; amount: number; cid?: string; cidConsent: boolean; purpose?: string }) => run(async () => {
        const { sb, session, db } = ctx();
        const cid = c.cid?.trim() || null;
        if (cid && !c.cidConsent) throw new Error("O CID só pode constar com o consentimento do paciente.");
        const row = { issued_on: c.issuedOn, starts_on: c.startsOn, kind: c.kind, amount: c.amount, cid, cid_consent: !!cid, purpose: c.purpose?.trim() || null };
        if (c.id) await q(sb.from("certificates").update(row).eq("id", c.id));
        else await q(sb.from("certificates").insert({ ...row, clinic_id: session.clinicId, patient_id: c.patientId,
          professional_name: db.profile.professionalName ?? null, professional_cro: db.profile.cro ?? null, professional_cro_uf: db.profile.croUf ?? null }));
      }),
      remove: (id: string) => run(async () => { await q(ctx().sb.from("certificates").delete().eq("id", id)); }),
    },

    customDocuments: {
      save: (d: { id?: string; patientId: string; issuedOn: string; title: string; body: string }) => run(async () => {
        const { sb, session, db } = ctx();
        const title = d.title.trim(), body = d.body.trim();
        if (!title) throw new Error("Dê um título ao documento.");
        if (!body) throw new Error("Escreva o texto do documento.");
        if (d.id) {
          const rows = await q(sb.from("custom_documents").update({ title, body, issued_on: d.issuedOn }).eq("id", d.id).select("id"));
          if (!rows?.length) throw new Error(NO_ROWS);
        } else await q(sb.from("custom_documents").insert({ clinic_id: session.clinicId, patient_id: d.patientId, title, body, issued_on: d.issuedOn,
          professional_name: db.profile.professionalName ?? null, professional_cro: db.profile.cro ?? null, professional_cro_uf: db.profile.croUf ?? null }));
      }),
      remove: (id: string) => run(async () => {
        const rows = await q(ctx().sb.from("custom_documents").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
    },

    // Bucket privado "patient-files"; caminho <clinica>/<paciente>/<uuid>.<ext>. Se a linha falhar, o objeto é desfeito.
    patientFiles: {
      add: (patientId: string, file: File) => run(async () => {
        const { sb, session } = ctx();
        const mime = checkFile(file, MAX_FILE_BYTES);
        const path = `${session.clinicId}/${patientId}/${crypto.randomUUID()}.${EXT[mime]}`;
        const up = await sb.storage.from("patient-files").upload(path, file, { contentType: mime, upsert: false });
        if (up.error) throw friendly(up.error);
        const ins = await sb.from("patient_files").insert({ clinic_id: session.clinicId, patient_id: patientId, name: file.name.slice(0, 200), mime, size_bytes: file.size, storage_path: path });
        if (ins.error) { await sb.storage.from("patient-files").remove([path]); throw friendly(ins.error); }
      }),
      // Apaga o objeto ANTES da linha: a política do storage consulta a linha para saber quem enviou.
      remove: (id: string) => run(async () => {
        const { sb } = ctx();
        const row = (await q(sb.from("patient_files").select("storage_path").eq("id", id).limit(1)) as Row[])[0];
        if (!row) throw new Error(NO_ROWS);
        const rm = await sb.storage.from("patient-files").remove([row.storage_path as string]);
        if (rm.error) throw friendly(rm.error);
        if (!rm.data?.length) throw new Error(NO_ROWS);
        const rows = await q(sb.from("patient_files").delete().eq("id", id).select("id"));
        if (!rows?.length) throw new Error(NO_ROWS);
      }),
      url: async (id: string) => {
        const { sb } = ctx();
        const row = (await q(sb.from("patient_files").select("storage_path").eq("id", id).limit(1)) as Row[])[0];
        if (!row) throw new Error("Arquivo não encontrado.");
        const { data, error } = await sb.storage.from("patient-files").createSignedUrl(row.storage_path as string, 60);
        if (error || !data) throw new Error("Não foi possível abrir o arquivo.");
        return data.signedUrl;
      },
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
        if ("croUf" in patch) member.cro_uf = patch.croUf ?? null;
        if ("cpf" in patch) member.cpf = patch.cpf ?? null;
        if ("birthDate" in patch) member.birth_date = patch.birthDate ?? null;
        if ("theme" in patch) member.theme = patch.theme;
        if ("workMode" in patch) clinic.work_mode = patch.workMode;
        if ("contact" in patch) clinic.contact = patch.contact ?? null;
        if ("pdfColor" in patch) clinic.pdf_color = patch.pdfColor ?? null;
        if ("activeSpecialtyIds" in patch) clinic.active_specialty_ids = patch.activeSpecialtyIds;
        if ("onboardingDone" in patch) clinic.onboarding_done = patch.onboardingDone;
        if ("clinicName" in patch) clinic.name = patch.clinicName;
        if ("logo" in patch) clinic.logo_data = patch.logo ?? null;
        // Linha de equipe só muda por RPC (nome, CRO, UF, CPF, nascimento e tema); papel e status ficam fora do alcance do membro.
        if (Object.keys(member).length) {
          const cur = ctx().db.profile;
          await q(sb.rpc("update_my_profile", {
            p_professional_name: "professional_name" in member ? member.professional_name : cur.professionalName ?? null,
            p_cro: "cro" in member ? member.cro : cur.cro ?? null,
            p_theme: "theme" in member ? member.theme : cur.theme,
            p_cro_uf: "cro_uf" in member ? member.cro_uf : cur.croUf ?? null,
            p_cpf: "cpf" in member ? member.cpf : cur.cpf ?? null,
            p_birth_date: "birth_date" in member ? member.birth_date : cur.birthDate ?? null,
          }));
        }
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
