"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Eraser, Maximize2, Minimize2, MousePointer2, MoveUpRight, Minus, CircleDot, Undo2, Trash2 } from "lucide-react";
import type { HofFace, HofShape } from "@/lib/types";
import { HOF_COLORS, HOF_FACES, HOF_REGIONS, HOF_REGIONS_BY_FACE, HOF_VIEW, hofFaceSrc } from "@/lib/hof";
import { uid } from "@/lib/format";
import { Segmented, cx } from "./ui";

type Tool = "select" | "point" | "arrow" | "line" | "erase";
type Pt = [number, number];

const TOOLS: { id: Tool; label: string; Icon: typeof Eraser }[] = [
  { id: "select", label: "Selecionar", Icon: MousePointer2 }, { id: "point", label: "Ponto", Icon: CircleDot },
  { id: "arrow", label: "Seta", Icon: MoveUpRight }, { id: "line", label: "Linha", Icon: Minus }, { id: "erase", label: "Borracha", Icon: Eraser },
];
const SHAPE_NAME = { point: "Ponto", arrow: "Seta", line: "Linha" } as const;

// Visual minimalista: traço fino, sem contorno escuro. Cor própria da marcação (padrão ciano).
const INK = "#00e5ff", AIM = "#ffd400", PLACED = "#ffffff", REGION_ON = "#ff4d8d";

const clampPt = ([x, y]: Pt): Pt => [Math.min(HOF_VIEW.w, Math.max(0, Math.round(x * 10) / 10)), Math.min(HOF_VIEW.h, Math.max(0, Math.round(y * 10) / 10))];

function ShapeView({ s, color, interactive, picked, label, onActivate }: {
  s: Pick<HofShape, "kind" | "points" | "color">; color: string; interactive?: boolean; picked?: boolean; label?: string; onActivate?: () => void;
}) {
  const [a, b] = s.points;
  const c = s.color ?? color;
  const [x2, y2] = b ?? a;
  const ang = Math.atan2(y2 - a[1], x2 - a[0]), L = 4.5, W = 0.5;
  const head = s.kind === "arrow" ? `M${x2 - L * Math.cos(ang - W)} ${y2 - L * Math.sin(ang - W)} L${x2} ${y2} L${x2 - L * Math.cos(ang + W)} ${y2 - L * Math.sin(ang + W)}` : "";
  const ring = (x: number, y: number, r: number) => <circle cx={x} cy={y} r={r} fill="none" stroke={c} strokeWidth={0.5} strokeDasharray="1.2 1.2" strokeOpacity={0.9} />;
  const hit = s.kind === "point" ? <circle cx={a[0]} cy={a[1]} r={10} fill="transparent" /> : <path d={`M${a[0]} ${a[1]} L${x2} ${y2}`} stroke="transparent" strokeWidth={16} fill="none" />;
  return (
    <g
      style={{ pointerEvents: interactive ? "all" : "none", cursor: interactive ? "pointer" : undefined }}
      role={interactive ? "button" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? label : undefined} aria-pressed={interactive ? !!picked : undefined}
      onClick={interactive ? (e) => { e.stopPropagation(); onActivate?.(); } : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onActivate?.(); } } : undefined}
      className="outline-none focus-visible:outline-1 focus-visible:outline-[#ff3d00]"
    >
      {hit}
      {s.kind === "point" ? (
        <>
          <circle cx={a[0]} cy={a[1]} r={2.8} fill="none" stroke="#fff" strokeOpacity={0.45} strokeWidth={0.4} />
          <circle cx={a[0]} cy={a[1]} r={picked ? 2 : 1.6} fill={c} />
          {picked && ring(a[0], a[1], 4.6)}
        </>
      ) : (
        <>
          <path d={`M${a[0]} ${a[1]} L${x2} ${y2}`} fill="none" stroke={c} strokeWidth={picked ? 1.2 : 0.9} strokeLinecap="round" />
          {head && <path d={head} fill="none" stroke={c} strokeWidth={picked ? 1.2 : 0.9} strokeLinecap="round" strokeLinejoin="round" />}
          {picked && <>{ring(a[0], a[1], 3.4)}{ring(x2, y2, 3.4)}</>}
        </>
      )}
    </g>
  );
}

/** Silhueta neutra usada quando a imagem do rosto não existe. */
function Silhouette() {
  return (
    <svg viewBox="0 0 300 400" className="absolute inset-0 size-full" aria-hidden>
      <rect width="300" height="400" fill="#d8d4cf" />
      <path d="M60 400 Q70 350 120 340 L180 340 Q230 350 240 400 Z" fill="#b9b3ac" />
      <rect x="128" y="300" width="44" height="50" fill="#c6c0b9" />
      <ellipse cx="150" cy="190" rx="78" ry="108" fill="#c6c0b9" />
    </svg>
  );
}

/** Imagem do rosto + camada SVG. Sem `interaction`, é só leitura (impressão e miniaturas). */
export function FaceStage({ face, regions = [], placedRegions = [], shapes = [], placedShapes = [], interaction, className }: {
  face: HofFace; regions?: string[]; placedRegions?: string[]; shapes?: HofShape[]; placedShapes?: HofShape[]; className?: string;
  interaction?: {
    mode: "regions" | "draw"; tool: Tool; color: string; onToggleRegion: (id: string) => void; onShapes: (next: HofShape[]) => void;
    picked?: string; onPick: (id: string | undefined) => void;
  };
}) {
  const [missing, setMissing] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<{ kind: "arrow" | "line"; a: Pt; b: Pt } | null>(null);
  const [cursor, setCursor] = useState<Pt>([150, 200]);
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const descId = useId();

  // onError pode disparar antes da hidratação; confere de novo ao montar.
  useEffect(() => { setMissing(false); const el = img.current; if (el?.complete && el.naturalWidth === 0) setMissing(true); }, [face]);

  const draw = interaction?.mode === "draw";
  const tool = interaction?.tool ?? "select";
  const drawing = draw && (tool === "point" || tool === "arrow" || tool === "line");
  const toView = (e: { clientX: number; clientY: number }): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return clampPt([((e.clientX - r.left) / r.width) * HOF_VIEW.w, ((e.clientY - r.top) / r.height) * HOF_VIEW.h]);
  };
  const add = (kind: HofShape["kind"], points: Pt[]) => interaction && interaction.onShapes([...shapes, { id: uid(), kind, points, color: interaction.color }]);
  const finish = (a: Pt, b: Pt, kind: "arrow" | "line") => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 6) add(kind, [a, b]); setDraft(null); };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!drawing) { if (draw) interaction?.onPick(undefined); return; }
    e.preventDefault();
    const p = toView(e);
    if (tool === "point") return add("point", [p]);
    svg.current?.setPointerCapture(e.pointerId);
    setDraft({ kind: tool as "arrow" | "line", a: p, b: p });
  };
  const onPointerMove = (e: React.PointerEvent) => { if (draft) setDraft({ ...draft, b: toView(e) }); };
  const onPointerUp = (e: React.PointerEvent) => { if (draft) finish(draft.a, toView(e), draft.kind); };

  // Alternativa de teclado ao desenho com ponteiro: setas movem a mira; Enter marca; Esc cancela.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!drawing) return;
    const step = e.shiftKey ? 15 : 5;
    const move: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (move[e.key]) {
      e.preventDefault();
      const n = clampPt([cursor[0] + move[e.key][0], cursor[1] + move[e.key][1]]);
      setCursor(n);
      if (draft) setDraft({ ...draft, b: n });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (tool === "point") add("point", [cursor]);
      else if (draft) finish(draft.a, cursor, draft.kind);
      else setDraft({ kind: tool as "arrow" | "line", a: cursor, b: cursor });
    } else if (e.key === "Escape" && draft) { e.preventDefault(); e.stopPropagation(); setDraft(null); }
  };

  const shapeHit = (id: string) => {
    if (tool === "erase") { interaction?.onShapes(shapes.filter((s) => s.id !== id)); interaction?.onPick(undefined); }
    else interaction?.onPick(interaction?.picked === id ? undefined : id);
  };
  const pickable = draw && (tool === "select" || tool === "erase");

  return (
    <div className={cx("relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-[#d8d4cf]", className)}>
      {missing ? <Silhouette /> : (
        // eslint-disable-next-line @next/next/no-img-element -- imagem estática pequena; precisa de onError para cair na silhueta
        <img ref={img} src={hofFaceSrc(face)} alt="" aria-hidden onError={() => setMissing(true)} className="absolute inset-0 size-full object-cover" />
      )}
      <svg
        ref={svg} viewBox={`0 0 ${HOF_VIEW.w} ${HOF_VIEW.h}`} className="absolute inset-0 size-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff3d00]"
        style={{ touchAction: drawing ? "none" : "auto", cursor: drawing ? "crosshair" : undefined }}
        role={drawing ? "application" : "group"} tabIndex={drawing ? 0 : undefined}
        aria-label={drawing ? `Área de desenho: ${TOOLS.find((t) => t.id === tool)?.label}` : "Faceograma"} aria-describedby={drawing ? descId : undefined}
        onPointerDown={interaction ? onPointerDown : undefined} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDraft(null)}
        onKeyDown={interaction ? onKeyDown : undefined} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); setDraft(null); }}
      >
        <g>
          {HOF_REGIONS_BY_FACE[face].map((r) => {
            const on = regions.includes(r.id), placed = placedRegions.includes(r.id), lit = hover === r.id;
            if (!interaction && !on) return null; // leitura: só as regiões usadas
            return (
              <g
                key={r.id} transform={r.mirror ? `translate(${HOF_VIEW.w} 0) scale(-1 1)` : undefined}
                {...(interaction ? {
                  role: "button", tabIndex: 0, "aria-label": r.label, "aria-pressed": on,
                  onClick: () => interaction.onToggleRegion(r.id),
                  onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); interaction.onToggleRegion(r.id); } },
                  onPointerEnter: () => setHover(r.id), onPointerLeave: () => setHover(null), onFocus: () => setHover(r.id), onBlur: () => setHover(null),
                  style: { pointerEvents: draw ? "none" : "all", cursor: "pointer" },
                } : { style: { pointerEvents: "none" } })}
                className="outline-none focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#ff3d00]"
              >
                {!on && <path d={r.d} fill="none" stroke="#000" strokeOpacity={0.22} strokeWidth={1.5} strokeLinejoin="round" />}
                <path
                  d={r.d} fillRule="evenodd" strokeLinejoin="round" fill={on ? REGION_ON : placed ? INK : "#fff"} fillOpacity={on ? 0.35 : placed ? 0.2 : lit ? 0.15 : 0.02}
                  stroke={on ? REGION_ON : "#fff"} strokeWidth={on ? 0.8 : 0.75} strokeOpacity={on ? 0.95 : 0.9} strokeDasharray={on ? undefined : "2.5 2.5"}
                />
                {interaction && <path d={r.d} fill="none" stroke="transparent" strokeWidth={8} strokeLinejoin="round" />}
              </g>
            );
          })}
        </g>
        {placedShapes.map((s) => <ShapeView key={s.id} s={s} color={PLACED} />)}
        {shapes.map((s, i) => (
          <ShapeView key={s.id} s={s} color={interaction?.color ?? INK} interactive={pickable} picked={interaction?.picked === s.id}
            label={`${SHAPE_NAME[s.kind]} ${i + 1}${tool === "erase" ? ": apagar" : ""}`} onActivate={() => shapeHit(s.id)} />
        ))}
        {draft && <ShapeView s={{ kind: draft.kind, points: [draft.a, draft.b] }} color={interaction?.color ?? INK} />}
        {drawing && focused && <g aria-hidden pointerEvents="none" stroke={AIM} strokeWidth={0.6} fill="none"><circle cx={cursor[0]} cy={cursor[1]} r={5} /><circle cx={cursor[0]} cy={cursor[1]} r={0.6} fill={AIM} stroke="none" /></g>}
      </svg>
      {drawing && <p id={descId} className="sr-only">Use as setas do teclado para mover a mira (Shift anda mais). Enter marca; para seta e linha, Enter no início e de novo no fim. Esc cancela.</p>}
    </div>
  );
}

/** Seletor de regiões e desenho, com alternador de rosto e tela cheia (por CSS, funciona também no iPhone). */
export function HofFaceogram({ face, onFace, regions, onToggleRegion, shapes, onShapes, placedRegions, placedShapes }: {
  face: HofFace; onFace: (f: HofFace) => void; regions: string[]; onToggleRegion: (id: string) => void;
  shapes: HofShape[]; onShapes: (s: HofShape[]) => void; placedRegions: string[]; placedShapes: HofShape[];
}) {
  const [mode, setMode] = useState<"regions" | "draw">("regions");
  const [tool, setTool] = useState<Tool>("point");
  const [picked, setPicked] = useState<string>();
  const [color, setColor] = useState<string>(HOF_COLORS[0].id);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [full]);

  const pickColor = (c: string) => { setColor(c); if (picked) onShapes(shapes.map((s) => (s.id === picked ? { ...s, color: c } : s))); };
  const del = (id?: string) => { if (!id) return; onShapes(shapes.filter((s) => s.id !== id)); setPicked(undefined); };

  return (
    <div className={cx(full ? "fixed inset-0 z-50 overflow-y-auto bg-surface-200 p-4" : "space-y-3")} {...(full ? { role: "dialog", "aria-modal": true, "aria-label": "Faceograma em tela cheia" } : {})}>
      <div className={cx("flex flex-wrap items-center gap-2", full && "mb-3")}>
        <Segmented size="sm" label="Rosto" value={face} onChange={onFace} options={HOF_FACES.map((f) => ({ value: f.id, label: f.label }))} />
        <Segmented size="sm" label="Modo" value={mode} onChange={setMode} options={[{ value: "regions", label: "Regiões" }, { value: "draw", label: "Desenhar" }]} />
        <button type="button" onClick={() => setFull(!full)} aria-label={full ? "Sair da tela cheia" : "Tela cheia"}
          className="ml-auto grid size-10 place-items-center rounded-pill border border-border-strong hover:bg-surface-300">
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {mode === "draw" && (
        <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Ferramentas de desenho">
          {TOOLS.map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-label={label} aria-pressed={tool === id} title={label} onClick={() => setTool(id)}
              className={cx("inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-md border px-2.5 text-sm", tool === id ? "border-ink bg-surface-300 font-semibold" : "border-border-strong hover:bg-surface-300")}>
              <Icon className="size-4" aria-hidden /><span className="hidden sm:inline">{label}</span>
            </button>
          ))}
          <button type="button" aria-label="Desfazer última marcação" disabled={!shapes.length} onClick={() => del(shapes.at(-1)?.id)}
            className="grid size-10 place-items-center rounded-md border border-border-strong hover:bg-surface-300 disabled:opacity-40"><Undo2 className="size-4" /></button>
          <button type="button" aria-label="Excluir marcação selecionada" disabled={!picked} onClick={() => del(picked)}
            className="grid size-10 place-items-center rounded-md border border-border-strong hover:bg-surface-300 disabled:opacity-40"><Trash2 className="size-4" /></button>
        </div>
      )}

      {mode === "draw" && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Cor da marcação">
          <span className="text-xs font-semibold text-ink-muted">Cor</span>
          {HOF_COLORS.map((c) => (
            <button key={c.id} type="button" aria-label={c.label} aria-pressed={color === c.id} title={c.label} onClick={() => pickColor(c.id)}
              className={cx("grid size-8 place-items-center rounded-pill border", color === c.id ? "border-ink ring-2 ring-ink/30" : "border-border-strong")}>
              <span className="size-4 rounded-pill border border-black/20" style={{ background: c.id }} />
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full" style={{ maxWidth: full ? "min(100%, calc((100dvh - 14rem) * 0.75))" : "26rem" }}>
        <FaceStage face={face} regions={regions} placedRegions={placedRegions} shapes={shapes} placedShapes={placedShapes}
          interaction={{ mode, tool, color, onToggleRegion, onShapes, picked, onPick: setPicked }} />
      </div>
      <p className="text-center text-xs text-ink-muted">
        {mode === "regions" ? "Toque nas regiões do rosto ou escolha pela lista." : "Desenhe os pontos de aplicação. Marcações brancas já estão em outros itens."}
      </p>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-ink-muted">Regiões do item ({regions.length})</legend>
        <div className="flex flex-wrap gap-1.5">
          {HOF_REGIONS.map((r) => {
            const on = regions.includes(r.id);
            return (
              <button key={r.id} type="button" aria-pressed={on} onClick={() => onToggleRegion(r.id)}
                className={cx("h-10 rounded-pill border px-3 text-sm", on ? "border-brand bg-brand-soft font-semibold" : "border-border-strong hover:bg-surface-300")}>{r.label}</button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
