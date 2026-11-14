export type ToothCondition =
  | "healthy" | "erupting" | "decayed" | "failed_restoration" | "fractured"
  | "mobile" | "restored" | "has_endodontics" | "has_prosthesis" | "implant"
  | "impacted" | "missing";

export type Phase = "urgency" | "oral_prep" | "rehab" | "esthetic" | "maintenance";

export interface Address {
  cep?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; uf?: string;
}

export interface Guardian { name: string; phone?: string; relationship?: string }

export interface Patient {
  id: string;
  fullName: string;
  birthDate?: string; // yyyy-mm-dd
  sex?: "female" | "male" | "other";
  cpf?: string;
  phone?: string;
  email?: string;
  address?: Address;
  guardian?: Guardian;
  referralSource?: string;
  notes?: string;
  recallEnabled: boolean;
  lastVisitAt?: string; // ISO
  createdAt: string;
}

export interface PatientEvent {
  id: string;
  patientId: string;
  kind: "created" | "plan_created" | "budget_presented" | "budget_authorized"
    | "treatment_done" | "payment_received" | "appointment_scheduled";
  label: string;
  createdAt: string;
}

export interface Specialty { id: string; name: string }

export interface Procedure {
  id: string;
  specialtyId: string;
  group: string;
  name: string;
  custom?: boolean;
}

export interface PlanItem {
  id: string;
  tooth?: number; // FDI
  conditions: ToothCondition[];
  procedureId?: string;
  procedureName?: string;
  phase: Phase;
  priceCents?: number;
}

export interface TreatmentPlan {
  id: string;
  patientId: string;
  kind: "adult" | "child";
  validityDays: number;
  items: PlanItem[];
  status: "draft" | "budgeted" | "authorized";
  createdAt: string;
}

export interface Budget {
  id: string;
  planId: string;
  patientId: string;
  totalCents: number;
  status: "presented" | "authorized" | "declined";
  authorizedItemIds: string[];
  presentedAt: string;
  authorizedAt?: string;
}

export interface Treatment {
  id: string;
  patientId: string;
  budgetId?: string;
  planItemId?: string;
  procedureName: string;
  performedAt: string; // yyyy-mm-dd
  priceCents: number;
  paymentStatus: "pending" | "received";
  clinicalStatus: "in_progress" | "done";
  createdAt: string;
}

export interface Expense {
  id: string;
  category: string;
  description?: string;
  amountCents: number;
  spentAt: string; // yyyy-mm-dd
  recurring: boolean;
}

export type AppointmentKind = "consultation" | "return" | "personal";
export type AppointmentStatus = "to_confirm" | "confirmed" | "done" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  patientId?: string;
  title?: string; // for personal
  kind: AppointmentKind;
  date: string; // yyyy-mm-dd
  time?: string; // HH:mm, undefined = a definir
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
}

export interface MessageTemplate { kind: "confirmation" | "recall"; body: string }

export interface Profile {
  professionalName?: string;
  cro?: string;
  workMode: "solo" | "in_clinic" | "owns_clinic";
  contact?: string;
  pdfColor?: string;
  theme: "system" | "light" | "dark";
  activeSpecialtyIds: string[];
  onboardingDone: boolean;
}

export interface Access {
  plan: string;
  startsAt: string;
  expiresAt: string;
  email: string;
}

export interface Db {
  version: number;
  patients: Patient[];
  events: PatientEvent[];
  customProcedures: Procedure[];
  prices: Record<string, number>;
  plans: TreatmentPlan[];
  budgets: Budget[];
  treatments: Treatment[];
  expenses: Expense[];
  appointments: Appointment[];
  templates: MessageTemplate[];
  profile: Profile;
  access: Access;
}
