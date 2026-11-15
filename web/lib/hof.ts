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

type P = [number, number];
const f1 = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: P[]) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(" L")} Z`;

/** Elipse (rotação em graus) como polígono denso: permite girar sem `transform`. */
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
  const a = (rot * Math.PI) / 180;
  return poly(Array.from({ length: 36 }, (_, i) => {
    const t = (i / 36) * 2 * Math.PI, x = rx * Math.cos(t), y = ry * Math.sin(t);
    return [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)] as P;
  }));
};

/** Faixa de espessura w (meia largura, varia de w0 a w1) ao longo de uma curva Catmull-Rom pelos pontos dados. */
function band(ctrl: P[], w0: number, w1 = w0): string {
  const c = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]], pts: P[] = [], N = 10;
  for (let i = 1; i < c.length - 2; i++) {
    for (let k = 0; k < N; k++) {
      const t = k / N, t2 = t * t, t3 = t2 * t;
      pts.push([0, 1].map((j) => 0.5 * (2 * c[i][j] + (c[i + 1][j] - c[i - 1][j]) * t + (2 * c[i - 1][j] - 5 * c[i][j] + 4 * c[i + 1][j] - c[i + 2][j]) * t2 + (3 * c[i][j] - c[i - 1][j] - 3 * c[i + 1][j] + c[i + 2][j]) * t3)) as P);
    }
  }
  pts.push(ctrl[ctrl.length - 1]);
  const l: P[] = [], r: P[] = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
    const w = w0 + (w1 - w0) * (i / (pts.length - 1)) * 1, s = Math.sin((Math.PI * i) / (pts.length - 1)); // pontas arredondadas
    const ww = w * (0.35 + 0.65 * Math.min(1, s * 3));
    l.push([p[0] + nx * ww, p[1] + ny * ww]); r.push([p[0] - nx * ww, p[1] - ny * ww]);
  });
  return poly([...l, ...r.reverse()]);
}
const mirrorX = (pts: P[]): P[] => pts.map(([x, y]) => [300 - x, y]);

// Geometria por rosto, ajustada às feições de cada foto. Nos pares (_d/_e) o caminho fica no lado
// direito do paciente (esquerda da imagem) e o lado esquerdo é o espelho em x = 150.
// Banco restringe hof_regions a 18 ids: regiões do Simples sem id próprio viram sub-formas de um id existente
// (malar inclui a bochecha; olheira = periorbital; mandibula = linha do ângulo ao mento; pescoco = arco + platisma).
const PAIRED = ["mandibula", "tempora", "malar", "olheira", "nasogeniano"];
type Geo = Record<string, string>;

function build(g: Geo): HofRegion[] {
  return Object.entries(REGION_LABELS).map(([id, label]) => {
    const base = id.replace(/_[de]$/, "");
    const paired = PAIRED.includes(base);
    return { id, label, d: g[paired ? base : id], ...(paired && id.endsWith("_e") ? { mirror: true } : {}) };
  });
}

/** Pescoço: arco submentoniano + 3 faixas de platisma (laterais simétricas e central). */
const neck = (archY: number, sideTop: P, sideBot: P, half: number) => [
  band([[150 - half, archY - 6], [150 - half / 2, archY + 2], [150, archY + 5], [150 + half / 2, archY + 2], [150 + half, archY - 6]], 3.2),
  band([sideTop, sideBot], 3.4), band(mirrorX([sideTop, sideBot]), 3.4),
  band([[150, sideTop[1]], [150, sideBot[1]]], 3),
].join(" ");

export const HOF_REGIONS_BY_FACE: Record<HofFace, HofRegion[]> = {
  female: build({
    testa: poly([[116, 74], [184, 74], [207, 120], [93, 120]]),
    tempora: ell(83, 122, 5.5, 14, -12),
    glabela: poly([[150, 126], [161, 141], [150, 158], [139, 141]]),
    nariz: "M147.5 160 L152.5 160 L155 196 Q167 204 174 216 Q171 226 160 226 Q150 229 140 226 Q129 226 126 216 Q133 204 145 196 Z",
    olheira: band([[80, 176], [92, 186], [108, 188], [124, 178]], 5.5),
    malar: `${band([[72, 201], [94, 205], [118, 212]], 7)} ${ell(97, 236, 12, 8.5, -8)}`,
    nasogeniano: band([[127, 222], [119, 240], [114, 258]], 3.6),
    perioral: `${ell(150, 264, 49, 28)} ${ell(150, 264, 40, 19)}`,
    labio_superior: "M114 262 Q130 249 142 247 Q150 252 158 247 Q170 249 187 262 Q150 267 114 262 Z",
    labio_inferior: "M116 263 Q150 269 186 263 Q172 282 150 282 Q130 282 116 263 Z",
    mento: ell(150, 303, 21, 9),
    mandibula: band([[76, 238], [90, 268], [106, 290], [127, 304], [141, 309]], 5, 4),
    pescoco: neck(341, [118, 352], [108, 396], 42),
  }),
  male: build({
    testa: poly([[118, 90], [182, 90], [206, 137], [94, 137]]),
    tempora: ell(83, 136, 5.5, 14, -12),
    glabela: poly([[150, 140], [161, 153], [150, 168], [139, 153]]),
    nariz: "M147.5 164 L152.5 164 L155 200 Q168 208 175 219 Q172 230 161 230 Q150 233 139 230 Q128 230 125 219 Q132 208 145 200 Z",
    olheira: band([[84, 177], [95, 186], [110, 188], [125, 178]], 5.5),
    malar: `${band([[72, 203], [94, 207], [118, 213]], 7)} ${ell(97, 238, 12, 8.5, -8)}`,
    nasogeniano: band([[127, 228], [119, 242], [116, 256]], 3.6),
    perioral: `${ell(151, 265, 48, 27)} ${ell(151, 265, 39, 17)}`,
    labio_superior: "M118 258 Q132 250 143 251 Q150 254 158 251 Q170 250 184 258 Q150 262 118 258 Z",
    labio_inferior: "M120 259 Q150 263 183 259 Q170 277 151 277 Q133 277 120 259 Z",
    mento: ell(150, 303, 21, 9),
    mandibula: band([[77, 238], [91, 268], [107, 290], [127, 304], [141, 309]], 5, 4),
    pescoco: neck(343, [120, 354], [110, 396], 40),
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
