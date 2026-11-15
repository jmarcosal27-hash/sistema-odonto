import { useId } from "react";
import type { ToothCondition } from "@/lib/types";
import { toothType, isUpperTooth, type ToothType } from "@/lib/teeth";

// Desenho próprio. Coordenadas "de baixo": coroa no topo (y 0–46), raiz embaixo (y 46–90).
// Dentes superiores são espelhados na vertical (raiz para cima).
const CROWN: Record<ToothType, string> = {
  incisor: "M12 7 Q20 2 28 7 L27 44 Q20 48 13 44 Z",
  canine: "M11 16 L20 2 L29 16 L27 44 Q20 48 13 44 Z",
  premolar: "M10 9 Q14 3 17 7 Q20 5 23 7 Q26 3 30 9 L28 44 Q20 48 12 44 Z",
  molar: "M4 11 Q7 3 13 6 Q16 8 20 6 Q24 8 27 6 Q33 3 36 11 L35 44 Q20 49 5 44 Z",
};

function roots(type: ToothType, upper: boolean): { paths: string[]; axes: number[] } {
  switch (type) {
    case "incisor": return { paths: ["M13 44 Q20 48 27 44 Q25 70 20 88 Q15 70 13 44 Z"], axes: [20] };
    case "canine": return { paths: ["M13 44 Q20 48 27 44 Q25 72 20 90 Q15 72 13 44 Z"], axes: [20] };
    case "premolar": return { paths: ["M12 44 Q20 48 28 44 Q26 66 22 86 Q20 88 18 86 Q14 66 12 44 Z"], axes: [20] };
    case "molar":
      return upper
        ? { paths: ["M6 44 Q4 66 10 86 Q16 70 17 46 Z", "M17 46 Q20 74 20 80 Q21 72 23 46 Z", "M23 46 Q24 70 30 86 Q36 66 34 44 Z"], axes: [10, 20, 30] }
        : { paths: ["M6 44 Q5 68 12 88 Q18 70 19 47 Z", "M21 47 Q22 70 28 88 Q35 68 34 44 Z"], axes: [12, 28] };
  }
}

const BLUE = "#2563eb", RED = "#dc2626", GREEN = "#16a34a", AMBER = "#d97706";

export function ToothSvg({ n, conditions, className }: { n: number; conditions: ToothCondition[]; className?: string }) {
  const clipId = useId();
  const type = toothType(n);
  const upper = isUpperTooth(n);
  const { paths, axes } = roots(type, upper);
  const has = (c: ToothCondition) => conditions.includes(c);

  const missing = has("missing");
  const impacted = has("impacted");
  const implant = has("implant");
  const faded = missing || impacted;

  let crownFill = "var(--tooth-fill, #f8fafc)";
  let crownStroke: string | undefined;
  let crownWidth = 1.2;
  if (has("healthy")) { crownFill = "#16a34a33"; crownStroke = GREEN; }
  if (has("restored")) { crownFill = "#2563eb73"; crownStroke = BLUE; }
  if (has("failed_restoration")) { crownFill = "#dc262655"; crownStroke = RED; crownWidth = 1.8; }
  if (has("has_prosthesis")) { crownFill = "#2563eb1a"; crownStroke = BLUE; crownWidth = 2.6; }
  if (has("erupting")) { crownStroke = GREEN; }

  return (
    <svg viewBox="0 0 40 90" className={className} aria-hidden focusable="false">
      <defs><clipPath id={clipId}><path d={CROWN[type]} /></clipPath></defs>
      <g transform={upper ? "translate(0 90) scale(1 -1)" : undefined}
        fill="none" strokeLinejoin="round" strokeLinecap="round" opacity={faded ? 0.55 : 1}
        strokeDasharray={faded ? "3 2.5" : undefined}>
        {/* raízes (implante troca a raiz por um parafuso) */}
        {!implant && paths.map((d, i) => (
          <path key={i} d={d} className="stroke-ink-muted" style={{ fill: "var(--root-fill, #e2e8f0)" }} strokeWidth={1} strokeDasharray={has("erupting") ? "2 2" : undefined} />
        ))}
        {implant && (
          <g stroke={BLUE} strokeWidth={1.4} style={{ fill: "#2563eb26" }}>
            <path d="M14 47 H26 L24 84 L20 89 L16 84 Z" />
            {[53, 59, 65, 71, 77].map((y) => <path key={y} d={`M15 ${y} H25`} fill="none" />)}
          </g>
        )}
        {/* endodontia: obturação azul no canal */}
        {has("has_endodontics") && !implant && axes.map((x) => (
          <path key={x} d={`M${x} 40 L${x} ${type === "canine" ? 84 : 80}`} stroke={BLUE} strokeWidth={2} />
        ))}
        {/* coroa */}
        <path d={CROWN[type]} className="stroke-ink-muted" style={{ fill: crownFill }} stroke={crownStroke} strokeWidth={crownWidth} />
        {has("decayed") && (
          <g clipPath={`url(#${clipId})`}>
            <path d="M12 22 Q16 16 22 19 Q29 20 27 29 Q26 37 18 36 Q10 35 12 22 Z" fill={RED} stroke="none" opacity={0.85} />
          </g>
        )}
        {has("fractured") && <path d="M9 18 L19 26 L15 34 L26 44 L22 56 L28 68" stroke={RED} strokeWidth={2} />}
        {has("mobile") && (
          <g stroke={AMBER} strokeWidth={1.8}>
            <path d="M2 24 Q-1 32 2 40" /><path d="M38 24 Q41 32 38 40" />
            <path d="M0 18 Q-4 32 0 46" opacity={0.6} /><path d="M40 18 Q44 32 40 46" opacity={0.6} />
          </g>
        )}
      </g>
      {missing && (
        <path d="M8 24 L32 66 M32 24 L8 66" stroke="#6b7280" strokeWidth={2.4} strokeLinecap="round" />
      )}
    </svg>
  );
}
