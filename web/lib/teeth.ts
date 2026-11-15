import type { ToothCondition } from "./types";
import { ADULT_LOWER, ADULT_UPPER, CHILD_LOWER, CHILD_UPPER } from "./catalog";

/** Arcadas em notação FDI, da direita para a esquerda do paciente. */
export const ARCADES = {
  adult: { upper: ADULT_UPPER, lower: ADULT_LOWER },
  child: { upper: CHILD_UPPER, lower: CHILD_LOWER },
} as const;

export type ToothType = "incisor" | "canine" | "premolar" | "molar";

/** Tipo do dente pelo número FDI (decíduos 5x–8x não têm pré-molares: 4 e 5 são molares). */
export function toothType(n: number): ToothType {
  const unit = n % 10;
  if (unit <= 2) return "incisor";
  if (unit === 3) return "canine";
  if (n >= 50) return "molar";
  return unit <= 5 ? "premolar" : "molar";
}

export const isUpperTooth = (n: number) => { const q = Math.floor(n / 10); return q === 1 || q === 2 || q === 5 || q === 6; };

export interface ConditionMeta { id: ToothCondition; label: string; abbr: string; color: string }

/**
 * Condições exibidas no odontograma. Os ids são os já salvos (localStorage/Supabase),
 * então nenhum dado antigo muda: só ganham sigla e cor.
 * Mapeamento: Hígido=healthy, Cariado=decayed, Rest. insatisfatória=failed_restoration,
 * Fraturado=fractured, Com mobilidade=mobile, Restaurado=restored, Com endodontia=has_endodontics,
 * Com prótese=has_prosthesis, Implante=implant, Ausente=missing (+ Erupcionando e Incluso, mantidos).
 */
export const CONDITION_META: ConditionMeta[] = [
  { id: "healthy", label: "Hígido", abbr: "H", color: "#16a34a" },
  { id: "decayed", label: "Cariado", abbr: "C", color: "#dc2626" },
  { id: "failed_restoration", label: "Restauração insatisfatória", abbr: "RI", color: "#dc2626" },
  { id: "fractured", label: "Fraturado", abbr: "F", color: "#dc2626" },
  { id: "mobile", label: "Com mobilidade", abbr: "M", color: "#d97706" },
  { id: "restored", label: "Restaurado", abbr: "R", color: "#2563eb" },
  { id: "has_endodontics", label: "Com endodontia", abbr: "E", color: "#2563eb" },
  { id: "has_prosthesis", label: "Com prótese", abbr: "P", color: "#2563eb" },
  { id: "implant", label: "Implante", abbr: "Im", color: "#2563eb" },
  { id: "missing", label: "Ausente", abbr: "×", color: "#6b7280" },
  { id: "erupting", label: "Erupcionando", abbr: "Er", color: "#16a34a" },
  { id: "impacted", label: "Incluso", abbr: "In", color: "#6b7280" },
];

export const conditionMeta = (id: ToothCondition) => CONDITION_META.find((c) => c.id === id);

/** Hígido e ausente/incluso não combinam com o resto; as demais condições se somam. */
export function toggleCondition(list: ToothCondition[], c: ToothCondition): ToothCondition[] {
  if (list.includes(c)) return list.filter((x) => x !== c);
  if (c === "healthy" || c === "missing" || c === "impacted") return [c];
  return [...list.filter((x) => x !== "healthy" && x !== "missing" && x !== "impacted"), c];
}

/** Sigla curta para sob o número: "M+2" quando há mais de uma condição. */
export function conditionAbbr(list: ToothCondition[]): string {
  if (!list.length) return "";
  const first = conditionMeta(list[0])?.abbr ?? "";
  return list.length > 1 ? `${first}+${list.length - 1}` : first;
}
