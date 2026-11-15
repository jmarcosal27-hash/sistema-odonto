import { useId } from "react";
import type { ToothCondition } from "@/lib/types";
import { isUpperTooth, toothType } from "@/lib/teeth";
import { TOOTH_SHAPES } from "@/lib/tooth-paths";

/**
 * Dente em SVG vetorizado a partir da prancha de decíduos (lib/tooth-paths.ts).
 * Camadas: raiz, coroa, brilho, e as condições recortadas por clipPath (coroa/raiz).
 * Os permanentes derivam dos mesmos contornos por tipo, com escala própria.
 */
const SPEC = (n: number): { id: string; s: number } => {
  const upper = isUpperTooth(n), u = n % 10, type = toothType(n);
  if (n >= 50) return { id: `${upper ? "u5" : "l8"}${u}`, s: 1 };
  if (type === "molar") return upper ? { id: "u54", s: u >= 7 ? 1.08 : 1.15 } : { id: "l8x", s: u >= 7 ? 1.05 : 1.12 };
  if (type === "premolar") return upper ? { id: "u5x", s: 1.1 } : { id: "l8y", s: 1.06 };
  if (type === "canine") return { id: upper ? "u53" : "l83", s: 1.1 };
  return upper ? { id: u === 1 ? "u51" : "u52", s: u === 1 ? 1.25 : 1.2 } : { id: u === 1 ? "l81" : "l82", s: 1.15 };
};
const isLeft = (n: number) => { const q = Math.floor(n / 10); return q === 2 || q === 3 || q === 6 || q === 7; };

const BLUE = "#2563eb", BLUE_D = "#1e40af", RED = "#dc2626", RED_D = "#7f1d1d", GREEN_D = "#2f855a", AMBER = "#d97706", GRAY_D = "#5b6572";
const BLOB = "M0 -1 C.6 -1.1 1.1 -.5 .95 .1 C.9 .8 .3 1.1 -.3 .95 C-1 .8 -1.1 .1 -.8 -.5 C-.6 -.9 -.3 -1 0 -1 Z";

export function ToothSvg({ n, conditions, className }: { n: number; conditions: ToothCondition[]; className?: string }) {
  const uid = useId().replace(/:/g, "");
  const id = (s: string) => `${s}${uid}`;
  const upper = isUpperTooth(n);
  const { id: sid, s } = SPEC(n);
  const shape = TOOTH_SHAPES[sid];
  const has = (c: ToothCondition) => conditions.includes(c);

  const missing = has("missing"), impacted = has("impacted"), implant = has("implant");
  const erupting = has("erupting"), healthy = has("healthy"), prosthesis = has("has_prosthesis");
  const ghost = missing || impacted;

  const [cx0, cy0, cx1, cy1] = shape.cb;
  const cw = cx1 - cx0, ch = Math.abs(cy1 - cy0);
  const crownCx = (cx0 + cx1) / 2, crownCy = (cy0 + cy1) / 2;
  const rootLen = upper ? -shape.rb[1] : shape.rb[3];
  const dir = upper ? -1 : 1; // sentido da raiz no eixo y
  const outline = healthy ? GREEN_D : GRAY_D;
  const e = healthy ? ["#fbfffc", "#d3f2dc", "#8dd0a2"] : ["#ffffff", "#eceff3", "#b3bbc5"];
  const r = healthy ? ["#9bd3ab", "#d8f1df", "#bfe5c9", "#84c597"] : ["#a7aeb7", "#e8ebee", "#cfd4da", "#98a0aa"];
  const vb = upper ? "-68 -172 136 288" : "-68 -116 136 288";
  const blob = (x: number, y: number, rx: number, ry: number, k = 1) => {
    let i = 0;
    return BLOB.replace(/-?\d*\.?\d+/g, (v) => { const c = i++ % 2 ? y + parseFloat(v) * ry * k : x + parseFloat(v) * rx * k; return String(Math.round(c * 10) / 10); });
  };
  const restoredShift = has("decayed") ? -cw * 0.14 : 0;
  const dx = crownCx + (has("restored") ? cw * 0.2 : 0), dy = crownCy + (has("restored") ? -dir * ch * 0.1 : 0);
  const glow = `translate(${crownCx * 0.2} ${crownCy * 0.2}) scale(0.8)`;

  return (
    <svg viewBox={vb} className={className} aria-hidden focusable="false" strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <radialGradient id={id("e")} cx="0.42" cy="0.4" r="0.75">
          <stop offset="0" stopColor={e[0]} /><stop offset="0.6" stopColor={e[1]} /><stop offset="1" stopColor={e[2]} />
        </radialGradient>
        <linearGradient id={id("r")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={r[0]} /><stop offset="0.35" stopColor={r[1]} /><stop offset="0.65" stopColor={r[2]} /><stop offset="1" stopColor={r[3]} />
        </linearGradient>
        <linearGradient id={id("p")} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0" stopColor="#bfdbfe" /><stop offset="0.5" stopColor="#60a5fa" /><stop offset="1" stopColor="#2563eb" />
        </linearGradient>
        <linearGradient id={id("m")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#bfdbfe" /><stop offset="0.45" stopColor="#3b82f6" /><stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
        <radialGradient id={id("h")} cx="0.35" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id("c")}><path d={shape.crown} /></clipPath>
        <clipPath id={id("rt")}><path d={shape.root} /></clipPath>
        <clipPath id={id("all")}><path d={shape.crown} /><path d={shape.root} /></clipPath>
      </defs>

      <g opacity={ghost ? 0.32 : 1}>
        <g transform={`scale(${isLeft(n) ? -s : s} ${s})`} strokeDasharray={ghost || erupting ? "4 3" : undefined}>
          {/* raiz natural (some com implante) */}
          {!implant && (
            <>
              <path d={shape.root} fill={`url(#${id("r")})`} stroke={outline} strokeWidth={3.4} />
              {has("has_endodontics") && !missing && (
                <g clipPath={`url(#${id("rt")})`} fill="none" strokeDasharray="0">
                  {shape.canals.map((d, i) => <path key={i} d={d} stroke={BLUE_D} strokeWidth={6.5} />)}
                  {shape.canals.map((d, i) => <path key={"b" + i} d={d} stroke="#3b82f6" strokeWidth={4} />)}
                  {shape.canals.map((d, i) => <path key={"c" + i} d={d} stroke="#bfdbfe" strokeWidth={1.2} />)}
                </g>
              )}
            </>
          )}
          {/* implante: parafuso azul no lugar da raiz */}
          {implant && (
            <g transform={`scale(1 ${dir})`} strokeDasharray="0">
              {(() => {
                const hw = Math.max(9, cw * 0.19), L = Math.min(rootLen * 0.95, 130);
                const th = Array.from({ length: Math.floor((L - 24) / 10) }, (_, i) => 26 + i * 10);
                return (
                  <>
                    <path d={`M${-hw * 0.75} -4 H${hw * 0.75} L${hw * 0.6} 14 H${-hw * 0.6} Z`} fill="#9aa4b1" stroke={GRAY_D} strokeWidth={3} />
                    <path d={`M${-hw} 14 H${hw} L${hw * 0.82} ${L * 0.7} L${hw * 0.3} ${L} H${-hw * 0.3} L${-hw * 0.82} ${L * 0.7} Z`} fill={`url(#${id("m")})`} stroke={BLUE_D} strokeWidth={3.4} />
                    {th.map((y) => <path key={y} d={`M${-hw * (1 - y / L * 0.2)} ${y} L${hw * (1 - y / L * 0.2)} ${y - 4}`} stroke="#ffffff" strokeWidth={2.2} opacity={0.9} />)}
                  </>
                );
              })()}
            </g>
          )}

          {/* coroa */}
          <path d={shape.crown} fill={`url(#${id("e")})`} stroke={outline} strokeWidth={3.4} />
          {!ghost && <path d={shape.crown} fill={`url(#${id("h")})`} stroke="none" transform={glow} strokeDasharray="0" />}

          <g clipPath={`url(#${id("c")})`} strokeDasharray="0">
            {prosthesis && (
              <>
                <path d={shape.crown} fill={`url(#${id("p")})`} stroke={BLUE_D} strokeWidth={7} />
                <path d={shape.crown} fill={`url(#${id("h")})`} stroke="none" transform={glow} />
                {/* colar da capa */}
                <path d={`M${cx0} ${upper ? cy0 + 6 : cy1 - 6} H${cx1}`} stroke="#e5e7eb" strokeWidth={4} opacity={0.9} />
              </>
            )}
            {has("restored") && (
              <g>
                <path d={blob(crownCx + restoredShift, crownCy, cw * 0.34, ch * 0.31)} fill={BLUE} stroke="#ffffff" strokeWidth={5} />
                <path d={blob(crownCx + restoredShift, crownCy, cw * 0.34, ch * 0.31, 0.82)} fill="none" stroke={BLUE_D} strokeWidth={2.5} />
              </g>
            )}
            {has("failed_restoration") && (
              <g>
                <path d={blob(crownCx, crownCy, cw * 0.37, ch * 0.34)} fill={RED} stroke={RED_D} strokeWidth={5} />
                <path d={blob(crownCx, crownCy, cw * 0.37, ch * 0.34, 0.72)} fill="none" stroke="#ffffff" strokeWidth={3} strokeDasharray="7 5" />
              </g>
            )}
            {has("decayed") && (
              <g>
                <path d={blob(dx, dy, cw * 0.27, ch * 0.24)} fill={RED} stroke={RED_D} strokeWidth={4} />
                <path d={blob(dx, dy, cw * 0.27, ch * 0.24, 0.5)} fill={RED_D} />
              </g>
            )}
          </g>

          {/* câmara pulpar obturada */}
          {has("has_endodontics") && !implant && !missing && (
            <ellipse cx={0} cy={-dir * 13} rx={cw * 0.13} ry={9} fill={BLUE} stroke="#ffffff" strokeWidth={3.5} strokeDasharray="0" />
          )}

          {/* fratura: rachadura vermelha atravessando coroa e raiz */}
          {has("fractured") && (
            <g clipPath={`url(#${id("all")})`} strokeDasharray="0">
              <g transform={`scale(1 ${dir})`} fill="none">
                {(() => {
                  const top = -ch * 0.85, d = `M${cw * 0.28} ${top} L${cw * 0.02} ${top * 0.55} L${cw * 0.2} ${top * 0.3} L${-cw * 0.08} ${top * 0.02} L${cw * 0.08} ${rootLen * 0.2} L${-cw * 0.12} ${rootLen * 0.4} L${cw * 0.02} ${rootLen * 0.6}`;
                  return (<><path d={d} stroke={RED_D} strokeWidth={9} /><path d={d} stroke={RED} strokeWidth={5} /></>);
                })()}
              </g>
            </g>
          )}
        </g>
      </g>

      {/* mobilidade: marcas laterais */}
      {has("mobile") && (
        <g stroke={AMBER} strokeWidth={6} fill="none">
          <path d="M-62 -6 Q-72 20 -62 46" /><path d="M62 -6 Q72 20 62 46" />
          <path d="M-52 4 Q-58 20 -52 36" opacity={0.6} /><path d="M52 4 Q58 20 52 36" opacity={0.6} />
        </g>
      )}
      {missing && <path d={`M-38 ${upper ? -110 : 40} L38 ${upper ? -30 : 130} M38 ${upper ? -110 : 40} L-38 ${upper ? -30 : 130}`} stroke="#6b7280" strokeWidth={9} />}
      {impacted && <path d={`M0 ${upper ? -90 : 20} V${upper ? -20 : 90} M-14 ${upper ? -34 : 76} L0 ${upper ? -20 : 90} L14 ${upper ? -34 : 76}`} stroke="#6b7280" strokeWidth={7} fill="none" />}
    </svg>
  );
}
