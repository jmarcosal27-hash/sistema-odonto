import type { HofFace, HofShape, HofUnit, PlanItem } from "./types";

// Faceograma próprio: regiões desenhadas por nós sobre um viewBox 0 0 300 400.
// Os caminhos descrevem o lado direito do paciente (esquerda da imagem); o lado
// esquerdo (`mirror`) é o mesmo caminho espelhado em x = 150.

export const HOF_VIEW = { w: 300, h: 400 } as const;

export interface HofRegion { id: string; label: string; d: string; mirror?: boolean }

export const HOF_REGIONS: HofRegion[] = [
  { id: "testa", label: "Testa", d: "M92 78 Q150 50 208 78 L203 120 Q150 108 97 120 Z" },
  { id: "perioral", label: "Região perioral", d: "M100 282 a50 38 0 1 0 100 0 a50 38 0 1 0 -100 0 Z" },
  { id: "mandibula_d", label: "Mandíbula direita", d: "M68 205 L96 300 Q108 335 134 350 L138 318 L104 232 Z" },
  { id: "mandibula_e", label: "Mandíbula esquerda", d: "M68 205 L96 300 Q108 335 134 350 L138 318 L104 232 Z", mirror: true },
  { id: "pescoco", label: "Platisma e pescoço", d: "M100 356 Q150 376 200 356 L212 398 L88 398 Z" },
  { id: "tempora_d", label: "Têmpora direita", d: "M62 92 a20 32 0 1 0 40 0 a20 32 0 1 0 -40 0 Z" },
  { id: "tempora_e", label: "Têmpora esquerda", d: "M62 92 a20 32 0 1 0 40 0 a20 32 0 1 0 -40 0 Z", mirror: true },
  { id: "malar_d", label: "Malar direito", d: "M72 205 a30 24 0 1 0 60 0 a30 24 0 1 0 -60 0 Z" },
  { id: "malar_e", label: "Malar esquerdo", d: "M72 205 a30 24 0 1 0 60 0 a30 24 0 1 0 -60 0 Z", mirror: true },
  { id: "olheira_d", label: "Olheira direita", d: "M90 170 a28 18 0 1 0 56 0 a28 18 0 1 0 -56 0 Z" },
  { id: "olheira_e", label: "Olheira esquerda", d: "M90 170 a28 18 0 1 0 56 0 a28 18 0 1 0 -56 0 Z", mirror: true },
  { id: "nasogeniano_d", label: "Sulco nasogeniano direito", d: "M118 222 Q98 252 94 288 L126 294 Q132 258 144 232 Z" },
  { id: "nasogeniano_e", label: "Sulco nasogeniano esquerdo", d: "M118 222 Q98 252 94 288 L126 294 Q132 258 144 232 Z", mirror: true },
  { id: "nariz", label: "Nariz", d: "M150 148 L170 232 Q150 250 130 232 Z" },
  { id: "glabela", label: "Glabela", d: "M128 128 a22 18 0 1 0 44 0 a22 18 0 1 0 -44 0 Z" },
  { id: "labio_superior", label: "Lábio superior", d: "M116 276 Q134 260 150 266 Q166 260 184 276 Q150 286 116 276 Z" },
  { id: "labio_inferior", label: "Lábio inferior", d: "M118 280 Q150 292 182 280 Q172 312 150 314 Q128 312 118 280 Z" },
  { id: "mento", label: "Mento", d: "M120 322 Q150 308 180 322 Q174 350 150 354 Q126 350 120 322 Z" },
];

export const HOF_REGION_IDS = HOF_REGIONS.map((r) => r.id);
export const hofRegionLabel = (id: string) => HOF_REGIONS.find((r) => r.id === id)?.label ?? id;

export const HOF_UNITS: { id: HofUnit; label: string }[] = [
  { id: "U", label: "U (unidades)" }, { id: "mL", label: "mL" }, { id: "seringa", label: "seringa(s)" },
];
export const unitShort = (u: HofUnit) => (u === "seringa" ? "seringa(s)" : u);
export const productText = (i: Pick<PlanItem, "productAmount" | "productUnit">) =>
  i.productAmount ? `${String(i.productAmount).replace(".", ",")} ${i.productUnit ? unitShort(i.productUnit) : ""}`.trim() : "";

export const HOF_FACES: { id: HofFace; label: string }[] = [{ id: "female", label: "Feminino" }, { id: "male", label: "Masculino" }];
export const hofFaceSrc = (f: HofFace) => `/hof/face-${f}.png`;

/** Preços sugeridos (centavos) por nome; valem até a clínica definir o próprio em /tabela. */
export const HOF_SUGGESTED_PRICES: Record<string, number> = {
  "Toxina botulínica estética": 150000, "Preenchimento labial": 180000, "Bioestimulador de colágeno": 250000,
  "Preenchimento malar": 200000, "Preenchimento mandibular": 220000, "Preenchimento de mento": 180000,
  "Preenchimento de olheiras": 160000, "Preenchimento de têmporas": 190000, "Fios de PDO": 120000,
  "Peeling": 40000, "Skinbooster": 90000, "Lipo de papada enzimática": 100000, "Rinomodelação": 200000,
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Valida e normaliza as formas (limita coordenadas ao viewBox). Mesmas regras de hof_marks_valid no banco. */
export function cleanMarks(marks: HofShape[] | undefined): HofShape[] {
  const out: HofShape[] = [];
  for (const m of marks ?? []) {
    const need = m.kind === "point" ? 1 : m.kind === "arrow" || m.kind === "line" ? 2 : 0;
    if (!need || m.points?.length !== need) continue;
    out.push({ id: String(m.id), kind: m.kind, points: m.points.map(([x, y]) => [round1(clamp(x, 0, HOF_VIEW.w)), round1(clamp(y, 0, HOF_VIEW.h))] as [number, number]) });
  }
  if (out.length > 100) throw new Error("No máximo 100 marcações por item.");
  return out;
}

/** Confere o item HOF e devolve a versão normalizada; itens comuns passam sem mudança. */
export function checkHofItem(i: PlanItem): PlanItem {
  if (!i.hof) return i;
  const regions = [...new Set(i.hofRegions ?? [])];
  if (!regions.length) throw new Error(`Escolha ao menos uma região do rosto para ${i.procedureName ?? "o item de HOF"}.`);
  if (regions.some((r) => !HOF_REGION_IDS.includes(r))) throw new Error("Região do rosto inválida.");
  const amount = i.productAmount;
  if ((amount === undefined) !== (i.productUnit === undefined)) throw new Error("Informe a quantidade e a unidade do produto.");
  if (amount !== undefined && !(amount > 0 && amount <= 9999)) throw new Error("A quantidade do produto precisa ficar entre 0 e 9999.");
  if (i.productUnit && !HOF_UNITS.some((u) => u.id === i.productUnit)) throw new Error("Unidade do produto inválida.");
  return { ...i, hofRegions: regions, hofMarks: cleanMarks(i.hofMarks), hofFace: i.hofFace === "male" ? "male" : "female", dentistName: i.dentistName?.trim().slice(0, 120) || undefined };
}
