import type { AnamnesisAnswer, AnamnesisChoice, Procedure, Specialty, ToothCondition, Phase } from "./types";

// Catálogo base montado a partir da nomenclatura odontológica de uso comum.
// Escrito do zero: grupos e ordem são nossos, não a curadoria do original.
const raw: Record<string, { name: string; groups: Record<string, string[]> }> = {
  geral: {
    name: "Clínica geral",
    groups: {
      "Avaliação": ["Consulta inicial", "Consulta de retorno", "Atendimento de urgência", "Plano de tratamento e diagnóstico", "Teste de vitalidade pulpar"],
      "Prevenção": ["Profilaxia (limpeza)", "Aplicação de flúor", "Selante", "Orientação de higiene", "Controle de placa", "Aplicação de cariostático"],
    },
  },
  dentistica: {
    name: "Dentística",
    groups: {
      "Restaurações": ["Restauração em resina – 1 face", "Restauração em resina – 2 faces", "Restauração em resina – 3 ou mais faces", "Restauração provisória", "Troca de restauração em amálgama"],
      "Estética": ["Faceta direta em resina", "Faceta em cerâmica", "Lente de contato dental", "Clareamento em consultório", "Clareamento caseiro (moldeira)", "Fechamento de diastema"],
    },
  },
  endo: {
    name: "Endodontia",
    groups: {
      "Canal": ["Canal – unirradicular", "Canal – birradicular", "Canal – multirradicular", "Retratamento de canal", "Pulpotomia", "Curativo de demora", "Remoção de núcleo"],
    },
  },
  perio: {
    name: "Periodontia",
    groups: {
      "Tratamento": ["Raspagem supragengival", "Raspagem subgengival por sextante", "Gengivectomia", "Gengivoplastia", "Cirurgia periodontal a retalho", "Enxerto gengival", "Manutenção periodontal"],
    },
  },
  cirurgia: {
    name: "Cirurgia",
    groups: {
      "Extrações": ["Extração simples", "Extração de dente incluso", "Extração de siso semi-incluso", "Extração de raiz residual"],
      "Outros": ["Frenectomia", "Biópsia", "Drenagem de abscesso", "Ulectomia", "Alveoloplastia"],
    },
  },
  protese: {
    name: "Prótese",
    groups: {
      "Fixa": ["Coroa em cerâmica", "Coroa metalocerâmica", "Coroa provisória", "Núcleo metálico fundido", "Pino de fibra de vidro", "Ponte fixa (por elemento)"],
      "Removível": ["Prótese total", "Prótese parcial removível", "Reembasamento", "Conserto de prótese"],
    },
  },
  implante: {
    name: "Implantodontia",
    groups: {
      "Implantes": ["Implante unitário", "Coroa sobre implante", "Enxerto ósseo", "Levantamento de seio maxilar", "Protocolo sobre implantes", "Prótese tipo overdenture"],
    },
  },
  orto: {
    name: "Ortodontia",
    groups: {
      "Aparelhos": ["Documentação ortodôntica", "Instalação de aparelho fixo", "Manutenção mensal", "Aparelho móvel", "Alinhadores", "Contenção fixa", "Remoção de aparelho"],
    },
  },
  odontoped: {
    name: "Odontopediatria",
    groups: {
      "Infantil": ["Consulta infantil", "Restauração em dente de leite", "Extração de dente de leite", "Pulpotomia em dente de leite", "Mantenedor de espaço", "Adequação comportamental"],
    },
  },
  radio: {
    name: "Radiologia",
    groups: {
      "Exames": ["Radiografia periapical", "Radiografia interproximal", "Radiografia panorâmica", "Tomografia", "Fotografia intraoral"],
    },
  },
  dtm: {
    name: "DTM e dor orofacial",
    groups: {
      "Tratamento": ["Placa miorrelaxante", "Ajuste oclusal", "Laserterapia", "Aplicação de toxina botulínica (bruxismo)"],
    },
  },
  estomato: {
    name: "Estomatologia",
    groups: {
      "Diagnóstico": ["Exame de lesão bucal", "Biópsia de lesão", "Tratamento de afta recorrente", "Acompanhamento de lesão"],
    },
  },
  harmonizacao: {
    name: "Harmonização orofacial",
    groups: { "Procedimentos": ["Preenchimento labial", "Toxina botulínica estética", "Bioestimulador"] },
  },
  odontogeriatria: {
    name: "Odontogeriatria",
    groups: { "Cuidados": ["Avaliação do idoso", "Adaptação de prótese antiga"] },
  },
};

export const SPECIALTIES: Specialty[] = Object.entries(raw).map(([id, s]) => ({ id, name: s.name }));

export const DEFAULT_ACTIVE_SPECIALTIES = [
  "geral", "dentistica", "endo", "perio", "cirurgia", "protese",
  "implante", "orto", "odontoped", "radio", "dtm", "estomato",
];

export const BASE_PROCEDURES: Procedure[] = Object.entries(raw).flatMap(([sid, s]) =>
  Object.entries(s.groups).flatMap(([group, names]) =>
    names.map((name, i) => ({ id: `${sid}-${group}-${i}`.toLowerCase().replace(/\s+/g, "-"), specialtyId: sid, group, name })),
  ),
);

export const FREQUENT_PROCEDURE_NAMES = [
  "Restauração em resina – 1 face", "Restauração em resina – 2 faces", "Canal – unirradicular",
  "Extração simples", "Coroa em cerâmica", "Profilaxia (limpeza)", "Faceta direta em resina",
];

export const CONDITIONS: { id: ToothCondition; label: string; tone: "success" | "danger" | "accent" | "muted" }[] = [
  { id: "healthy", label: "Saudável", tone: "success" },
  { id: "erupting", label: "Erupcionando", tone: "success" },
  { id: "decayed", label: "Cárie", tone: "danger" },
  { id: "failed_restoration", label: "Restauração com falha", tone: "danger" },
  { id: "fractured", label: "Fratura", tone: "danger" },
  { id: "mobile", label: "Mobilidade", tone: "danger" },
  { id: "restored", label: "Já restaurado", tone: "accent" },
  { id: "has_endodontics", label: "Canal feito", tone: "accent" },
  { id: "has_prosthesis", label: "Prótese", tone: "accent" },
  { id: "implant", label: "Implante", tone: "accent" },
  { id: "impacted", label: "Incluso", tone: "muted" },
  { id: "missing", label: "Ausente", tone: "muted" },
];

export const PHASES: { id: Phase; label: string; hint: string; tint: string }[] = [
  { id: "urgency", label: "Urgência", hint: "Dor, inflamação e o que não pode esperar.", tint: "bg-surface-warning-subtle" },
  { id: "oral_prep", label: "Preparo da boca", hint: "Controle de cárie e gengiva antes do resto.", tint: "bg-surface-info-subtle" },
  { id: "rehab", label: "Reabilitação", hint: "Devolver função: canais, coroas, implantes.", tint: "bg-surface-success-subtle" },
  { id: "esthetic", label: "Estética", hint: "Acabamento visual, depois da saúde.", tint: "bg-surface-accent-subtle" },
  { id: "maintenance", label: "Manutenção", hint: "Revisões e controles periódicos.", tint: "bg-surface-sidebar" },
];

export const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
export const CHILD_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const CHILD_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

export const EXPENSE_CATEGORIES = [
  "Aluguel", "Material", "Laboratório", "Equipe", "Contas (luz, água, internet)",
  "Impostos", "Marketing", "Equipamentos", "Outros",
];

export const REFERRAL_SOURCES = ["Indicação", "Instagram", "Google", "Convênio", "Passou na frente", "Outro"];

/** Modelo inicial de anamnese (texto próprio, editável pela clínica). */
export const DEFAULT_ANAMNESIS: { name: string; questions: { text: string; kind: "yesno" | "text"; alert?: boolean }[] } = {
  name: "Anamnese geral",
  questions: [
    { text: "Está em tratamento médico atualmente?", kind: "yesno", alert: true },
    { text: "Usa algum medicamento de forma contínua? Quais?", kind: "yesno", alert: true },
    { text: "Tem alergia a medicamento, anestésico ou látex?", kind: "yesno", alert: true },
    { text: "Tem problema no coração ou pressão alta?", kind: "yesno", alert: true },
    { text: "Tem diabetes?", kind: "yesno", alert: true },
    { text: "Usa anticoagulante ou tem problema de coagulação?", kind: "yesno", alert: true },
    { text: "Está grávida ou amamentando?", kind: "yesno", alert: true },
    { text: "Já teve reação ruim a anestesia local?", kind: "yesno", alert: true },
    { text: "Fuma ou usa outras formas de tabaco?", kind: "yesno" },
    { text: "Range ou aperta os dentes?", kind: "yesno" },
    { text: "Sangramento na gengiva ao escovar?", kind: "yesno" },
    { text: "Motivo da consulta e queixa principal", kind: "text" },
    { text: "Outras informações importantes de saúde", kind: "text" },
  ],
};

export const ANAMNESIS_CHOICES: { value: AnamnesisChoice; label: string }[] = [
  { value: "yes", label: "Sim" }, { value: "no", label: "Não" }, { value: "unknown", label: "Não sei" },
  { value: "na", label: "Não se aplica" }, { value: "private", label: "Conversa reservada" },
];

/** Resposta de uma pergunta de sim/não. Fichas antigas só têm `yes` (booleano); sem nenhum dos dois = não respondida. */
export function choiceOf(a: AnamnesisAnswer): AnamnesisChoice | undefined {
  return a.answer ?? (a.yes === true ? "yes" : a.yes === false ? "no" : undefined);
}

/** Há pergunta de sim/não sem resposta? Rascunho aceita; concluir não. */
export const hasUnanswered = (answers: AnamnesisAnswer[]) => answers.some((a) => a.kind === "yesno" && !choiceOf(a));
