import type { HofFace, HofShape, HofUnit, PlanItem } from "./types";

// Faceograma próprio: regiões desenhadas por nós sobre um viewBox 0 0 300 400.

export const HOF_VIEW = { w: 300, h: 400 } as const;

export interface HofRegion { id: string; label: string; d: string; mirror?: boolean }

/** Rótulos únicos (mesmos ids nos dois rostos). */
const REGION_LABELS: Record<string, string> = {
  testa: "Testa", perioral: "Região perioral", mandibula_d: "Mandíbula direita", mandibula_e: "Mandíbula esquerda", pescoco: "Platisma e pescoço",
  tempora_d: "Têmpora direita", tempora_e: "Têmpora esquerda", malar_d: "Malar direito", malar_e: "Malar esquerdo",
  olheira_d: "Olheira direita", olheira_e: "Olheira esquerda", nasogeniano_d: "Sulco nasogeniano direito", nasogeniano_e: "Sulco nasogeniano esquerdo",
  nariz: "Nariz", glabela: "Glabela", labio_superior: "Lábio superior", labio_inferior: "Lábio inferior", mento: "Mento",
};

/** Elipse como caminho (permite rotação sem `transform`). */
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) =>
  `M${cx - rx} ${cy} a${rx} ${ry} ${rot} 1 0 ${2 * rx} 0 a${rx} ${ry} ${rot} 1 0 ${-2 * rx} 0 Z`;

// Geometria por rosto, ajustada às feições de cada foto. Nos pares (_d/_e) o caminho fica no lado
// direito do paciente (esquerda da imagem) e o lado esquerdo é o espelho em x = 150.
const PAIRED = ["mandibula", "tempora", "malar", "olheira", "nasogeniano"];
type Geo = Record<string, string>;

function build(g: Geo): HofRegion[] {
  return Object.entries(REGION_LABELS).map(([id, label]) => {
    const base = id.replace(/_[de]$/, "");
    const paired = PAIRED.includes(base);
    return { id, label, d: g[paired ? base : id], ...(paired && id.endsWith("_e") ? { mirror: true } : {}) };
  });
}

export const HOF_REGIONS_BY_FACE: Record<HofFace, HofRegion[]> = {
  female: build({
    testa: "M98 100 Q150 84 202 100 Q208 112 200 121 Q150 108 100 121 Q92 112 98 100 Z",
    perioral: `${ell(150, 266, 46, 27)} ${ell(150, 266, 38, 19)}`,
    pescoco: "M106 338 Q150 352 194 338 L200 374 Q150 388 100 374 Z",
    nariz: "M147 182 L153 182 L158 214 Q166 218 166 223 Q150 231 134 223 Q134 218 142 214 Z",
    glabela: ell(150, 143, 9, 9),
    labio_superior: "M114 262 Q130 250 142 248 Q150 253 158 248 Q170 250 187 262 Q150 267 114 262 Z",
    labio_inferior: "M116 263 Q150 269 186 263 Q172 282 150 282 Q130 282 116 263 Z",
    mento: ell(150, 303, 20, 9),
    mandibula: "M68 236 Q76 275 108 304 Q124 316 138 318 L136 308 Q118 304 102 292 Q84 272 76 238 Z",
    tempora: ell(76, 127, 6.5, 13, -8),
    malar: ell(92, 208, 15, 9, -30),
    olheira: "M85 183 Q104 192 123 183 Q104 200 85 183 Z",
    nasogeniano: "M127 224 Q114 238 109 256 L113 258 Q119 240 130 227 Z",
  }),
  male: build({
    testa: "M98 112 Q150 96 202 112 Q208 126 200 136 Q150 122 100 136 Q92 126 98 112 Z",
    perioral: `${ell(151, 265, 46, 27)} ${ell(151, 265, 38, 19)}`,
    pescoco: "M100 338 Q150 352 200 338 L204 374 Q150 388 96 374 Z",
    nariz: "M147 185 L153 185 L158 220 Q166 224 167 229 Q150 237 133 229 Q134 224 142 220 Z",
    glabela: ell(150, 152, 9, 9),
    labio_superior: "M118 258 Q132 250 143 251 Q150 254 158 251 Q170 250 184 258 Q150 262 118 258 Z",
    labio_inferior: "M120 259 Q150 263 183 259 Q170 277 151 277 Q133 277 120 259 Z",
    mento: ell(150, 303, 20, 9),
    mandibula: "M66 232 Q76 275 108 304 Q124 316 138 318 L136 308 Q118 304 102 292 Q86 272 76 234 Z",
    tempora: ell(77, 140, 6.5, 13, -8),
    malar: ell(93, 208, 15, 9, -30),
    olheira: "M87 183 Q106 192 125 183 Q106 200 87 183 Z",
    nasogeniano: "M127 230 Q114 243 112 256 L116 258 Q120 245 130 233 Z",
  }),
};

/** Lista de regiões (ids e rótulos iguais nos dois rostos); a geometria vem de HOF_REGIONS_BY_FACE. */
export const HOF_REGIONS: HofRegion[] = HOF_REGIONS_BY_FACE.female;

/** Cores para as marcações (primeira = padrão). */
export const HOF_COLORS = [
  { id: "#00e5ff", label: "Ciano" }, { id: "#ff3d71", label: "Rosa" }, { id: "#ffd400", label: "Amarelo" },
  { id: "#7CFC00", label: "Verde" }, { id: "#ffffff", label: "Branco" }, { id: "#111111", label: "Preto" },
] as const;

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
    out.push({
      id: String(m.id), kind: m.kind, points: m.points.map(([x, y]) => [round1(clamp(x, 0, HOF_VIEW.w)), round1(clamp(y, 0, HOF_VIEW.h))] as [number, number]),
      ...(typeof m.color === "string" && /^#[0-9a-fA-F]{6}$/.test(m.color) ? { color: m.color } : {}),
    });
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
