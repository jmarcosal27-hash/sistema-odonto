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
  archived?: boolean;
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

export type Region = "upper" | "lower" | "both";

/** Anotação desenhada no faceograma. Coordenadas no viewBox 0 0 300 400 (ponto = 1 par, seta e linha = 2). */
export interface HofShape {
  id: string;
  kind: "point" | "arrow" | "line";
  points: [number, number][];
}

export type HofUnit = "U" | "mL" | "seringa";
export type HofFace = "female" | "male";

export interface PlanItem {
  id: string;
  /** Item de harmonização orofacial: usa os campos hof* e product*. Fichas antigas não têm nenhum deles. */
  hof?: boolean;
  hofFace?: HofFace;
  hofRegions?: string[]; // ids de HOF_REGIONS
  hofMarks?: HofShape[];
  productAmount?: number;
  productUnit?: HofUnit;
  dentistName?: string;
  tooth?: number; // FDI
  region?: Region; // item de arcada, sem dente específico
  conditions: ToothCondition[];
  procedureId?: string;
  procedureName?: string;
  phase: Phase;
  priceCents?: number; // valor unitário
  quantity?: number; // padrão 1
}

export type PaymentMethod = "pix" | "credit" | "debit" | "cash" | "transfer" | "boleto" | "other";

export interface TreatmentPlan {
  id: string;
  patientId: string;
  kind: "adult" | "child";
  validityDays: number;
  items: PlanItem[];
  discountCents?: number;
  paymentMethods?: PaymentMethod[];
  notes?: string;
  status: "draft" | "budgeted" | "authorized";
  createdAt: string;
}

export interface Budget {
  id: string;
  planId: string;
  patientId: string;
  subtotalCents?: number;
  discountCents?: number;
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
  procedureId?: string;
  priceCents: number;
  /** "budget": o pagamento é controlado pelas parcelas do orçamento. */
  paymentStatus: "pending" | "received" | "budget";
  clinicalStatus: "in_progress" | "done";
  createdAt: string;
}

export interface Installment {
  id: string;
  budgetId: string;
  patientId: string;
  number: number; // 1..n
  of: number;
  dueDate: string; // yyyy-mm-dd
  amountCents: number;
  method?: PaymentMethod;
  paidAt?: string; // yyyy-mm-dd
}

export interface Expense {
  id: string;
  category: string;
  description?: string;
  amountCents: number;
  spentAt: string; // yyyy-mm-dd (vencimento)
  recurring: boolean;
  paid?: boolean; // undefined = pago (dados antigos)
}

export type RecallStatus = "pending" | "contacted" | "scheduled" | "dismissed";

export interface RecallState {
  status: RecallStatus;
  dueAt: string; // a qual retorno este estado se refere
  updatedAt: string;
}

export type WaitlistStatus = "waiting" | "contacted" | "placed" | "removed";

export interface WaitlistEntry {
  id: string;
  patientId: string;
  period: "morning" | "afternoon" | "any";
  notes?: string;
  status: WaitlistStatus;
  createdAt: string;
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
  croUf?: string; // 2 letras
  cpf?: string; // só dígitos (opcional)
  birthDate?: string; // yyyy-mm-dd (opcional)
  workMode: "solo" | "in_clinic" | "owns_clinic";
  contact?: string;
  pdfColor?: string;
  theme: "system" | "light" | "dark";
  activeSpecialtyIds: string[];
  onboardingDone: boolean;
  clinicName?: string;
  /** Logo da clínica como data URL (reduzida no navegador); impressa no cabeçalho dos documentos. */
  logo?: string;
}

export interface Access {
  plan: string;
  startsAt: string;
  expiresAt: string;
  email: string;
}

/** Nota de evolução clínica: o que foi feito ou observado numa consulta. */
export interface ClinicalNote {
  id: string;
  patientId: string;
  treatmentId?: string; // atendimento ligado (opcional)
  date: string; // yyyy-mm-dd
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnamnesisQuestion {
  id: string;
  text: string;
  kind: "yesno" | "text";
  /** Resposta "sim" vira alerta na ficha (ex.: alergia, anticoagulante). */
  alert?: boolean;
}

export interface AnamnesisTemplate { id: string; name: string; questions: AnamnesisQuestion[]; createdAt: string }

/** Resposta guardada com cópia do texto da pergunta (o modelo pode mudar depois). */
/** Resposta explícita. Sem resposta = campo ausente (nunca vira "não"). */
export type AnamnesisChoice = "yes" | "no" | "unknown" | "na" | "private";

/** `yes` é o formato antigo (sim/não); fichas novas gravam `answer` e mantêm `yes` só para sim e não. */
export interface AnamnesisAnswer { questionId: string; text: string; kind: AnamnesisQuestion["kind"]; alert?: boolean; answer?: AnamnesisChoice; yes?: boolean; detail?: string }

export interface AnamnesisRecord {
  id: string;
  patientId: string;
  templateId?: string;
  templateName: string;
  answers: AnamnesisAnswer[];
  filledOn: string; // yyyy-mm-dd
  createdAt: string;
  /** Rascunho edita livremente; concluída é imutável (correção = nova revisão). */
  status: "draft" | "completed";
  /** Ficha concluída que esta revisão corrige. */
  revisionOf?: string;
  completedAt?: string;
  completedBy?: string;
}

export type MedicationRoute = "internal" | "external";

/** Medicamento da clínica: só nomes já usados por ela (a lista começa vazia). */
export interface Medication {
  id: string;
  name: string;
  route: MedicationRoute;
  controlled: boolean;
  unit?: string;
  defaultPosology?: string;
  createdAt: string;
}

export interface PrescriptionItem {
  id: string;
  medicationId?: string;
  name: string;
  quantity?: number;
  unit?: string;
  posology: string;
  route: MedicationRoute;
  /** Só sinaliza: o SmileOS não gera receita de controle especial válida. */
  controlled: boolean;
}

/** Dados do profissional ficam copiados no documento (snapshot da emissão). */
interface ProfessionalSnapshot { professionalName?: string; professionalCro?: string; professionalCroUf?: string }

export interface Prescription extends ProfessionalSnapshot {
  id: string;
  patientId: string;
  issuedOn: string; // yyyy-mm-dd
  notes?: string;
  items: PrescriptionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionTemplate { id: string; name: string; items: Omit<PrescriptionItem, "id" | "medicationId">[]; createdAt: string }

export interface Certificate extends ProfessionalSnapshot {
  id: string;
  patientId: string;
  issuedOn: string; // yyyy-mm-dd
  startsOn: string; // yyyy-mm-dd
  kind: "days" | "hours";
  amount: number;
  cid?: string;
  /** CID só entra com o consentimento do paciente. */
  cidConsent: boolean;
  purpose?: string;
  createdAt: string;
  updatedAt: string;
}

/** Documento de texto livre (minuta) com título próprio. */
export interface CustomDocument extends ProfessionalSnapshot {
  id: string;
  patientId: string;
  title: string;
  body: string;
  issuedOn: string; // yyyy-mm-dd
  createdAt: string;
  updatedAt: string;
}

export const FILE_MIMES = ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const;

/** Arquivo do paciente. Na nuvem o conteúdo fica no storage privado; na demonstração, em `dataUrl`. */
export interface PatientFile {
  id: string;
  patientId: string;
  name: string;
  mime: (typeof FILE_MIMES)[number];
  sizeBytes: number;
  createdAt: string;
  dataUrl?: string;
}

/** Etapa do funil de vendas. As quatro padrão têm `kind` e não podem ser excluídas nem mudar de tipo; as criadas pela clínica não têm. */
export type SalesStageKind = "open" | "in_progress" | "won" | "lost";

export interface SalesStage {
  id: string;
  name: string;
  position: number;
  kind?: SalesStageKind;
}

/** Oportunidade do funil. Orçamentos criam a sua automaticamente (`budgetId`); as demais são manuais. */
export interface Opportunity {
  id: string;
  patientId: string;
  stageId: string;
  budgetId?: string;
  title: string;
  valueCents: number;
  responsible?: string;
  label?: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string;
}

/** Comentário do usuário (até 255 caracteres) ou linha do histórico (mudança de etapa, criação). */
export interface OpportunityEvent {
  id: string;
  opportunityId: string;
  kind: "comment" | "stage" | "system";
  body: string;
  authorName?: string;
  createdAt: string;
}

export const MAX_COMMENT = 255;

/** Controle de prótese: trabalho enviado a um laboratório. A etapa é fixa (o fluxo é sempre o mesmo). */
export type ProsthesisStage = "pre_lab" | "sent" | "lab" | "scheduled" | "done";
export type ProsthesisKind = "crown" | "total" | "ppr" | "veneer" | "protocol" | "splint" | "other";

export interface Laboratory {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
}

export interface ProsthesisJob {
  id: string;
  patientId: string;
  stage: ProsthesisStage;
  /** Profissional responsável (texto livre ou nome de um membro). */
  professional: string;
  description: string;
  kind: ProsthesisKind;
  /** Dente(s) ou região, texto livre curto. */
  teeth?: string;
  /** Cor ou escala. */
  shade?: string;
  laboratoryId?: string;
  sentOn?: string; // yyyy-mm-dd
  dueOn?: string; // previsão de retorno, yyyy-mm-dd
  costCents?: number;
  notes?: string;
  label?: string;
  /** Retrabalho: o serviço voltou para refazer ou ajustar, sempre com motivo. */
  isReturn: boolean;
  returnReason?: string;
  createdAt: string;
  updatedAt: string;
  stageChangedAt: string;
}

export interface ProsthesisEvent {
  id: string;
  jobId: string;
  kind: "comment" | "stage" | "system";
  body: string;
  authorName?: string;
  createdAt: string;
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
  installments: Installment[];
  waitlist: WaitlistEntry[];
  recall: Record<string, RecallState>; // por paciente
  recallMonths: Record<string, number>; // por procedimento; padrão 6
  clinicalNotes: ClinicalNote[];
  anamnesisTemplates: AnamnesisTemplate[];
  anamnesisRecords: AnamnesisRecord[];
  medications: Medication[];
  prescriptions: Prescription[];
  prescriptionTemplates: PrescriptionTemplate[];
  certificates: Certificate[];
  customDocuments: CustomDocument[];
  patientFiles: PatientFile[];
  salesStages: SalesStage[];
  opportunities: Opportunity[];
  opportunityEvents: OpportunityEvent[];
  /** Meta de vendas por mês ("yyyy-mm"), em centavos. */
  salesGoals: Record<string, number>;
  laboratories: Laboratory[];
  prosthesisJobs: ProsthesisJob[];
  prosthesisEvents: ProsthesisEvent[];
}
