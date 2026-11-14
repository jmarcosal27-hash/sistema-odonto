"use client";

import { useRef } from "react";
import type { ToothCondition } from "@/lib/types";
import { CONDITIONS } from "@/lib/catalog";
import { cx } from "./ui";

const toneOf = (c: ToothCondition[]) => {
  const tones = c.map((x) => CONDITIONS.find((k) => k.id === x)?.tone);
  if (tones.includes("danger")) return "danger";
  if (tones.includes("accent")) return "accent";
  if (tones.includes("muted")) return "muted";
  if (tones.includes("success")) return "success";
  return null;
};

const fill: Record<string, string> = {
  danger: "fill-danger/25 stroke-danger",
  accent: "fill-accent/25 stroke-accent",
  success: "fill-success/25 stroke-success",
  muted: "fill-transparent stroke-muted [stroke-dasharray:3_2]",
};

function roots(n: number) {
  const unit = n % 10;
  return unit >= 6 ? 3 : unit >= 4 ? 2 : 1;
}

/** Desenho próprio, simplificado: coroa arredondada + raízes. */
function ToothShape({ n, upper, className }: { n: number; upper: boolean; className: string }) {
  const r = roots(n);
  const molar = r === 3;
  const crownW = molar ? 22 : r === 2 ? 18 : 15;
  const x0 = (28 - crownW) / 2;
  const span = crownW - 6;
  const rootPaths: string[] = Array.from({ length: r }, (_, i) => {
    const cx = x0 + 3 + (r === 1 ? span / 2 : (span / (r - 1)) * i);
    return `M${cx - 3} 20 Q${cx} 46 ${cx + 3} 20`;
  });
  const shape = (
    <g className={className} strokeWidth={1.4}>
      <rect x={x0} y={4} width={crownW} height={17} rx={molar ? 6 : 7} />
      {rootPaths.map((d, i) => <path key={i} d={d} fill="none" />)}
    </g>
  );
  return (
    <svg viewBox="0 0 28 50" className="w-6 sm:w-7 h-11 sm:h-12" aria-hidden>
      {upper ? <g transform="translate(0 50) scale(1 -1)">{shape}</g> : shape}
    </svg>
  );
}

export function Odontogram({ upper, lower, marks, selected, onSelect }: {
  upper: number[]; lower: number[];
  marks: Record<number, ToothCondition[]>;
  selected?: number; onSelect: (n: number) => void;
}) {
  const refs = useRef<Record<number, HTMLButtonElement | null>>({});
  const rows = [upper, lower];

  const move = (n: number, key: string) => {
    const r = upper.includes(n) ? 0 : 1;
    const i = rows[r].indexOf(n);
    let target: number | undefined;
    if (key === "ArrowRight") target = rows[r][i + 1];
    if (key === "ArrowLeft") target = rows[r][i - 1];
    if (key === "ArrowDown" && r === 0) target = rows[1][Math.min(i, rows[1].length - 1)];
    if (key === "ArrowUp" && r === 1) target = rows[0][Math.min(i, rows[0].length - 1)];
    if (target !== undefined) refs.current[target]?.focus();
  };

  return (
    <div className="overflow-x-auto">
      <div className="mx-auto w-max space-y-2 px-1">
        <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>Lado direito do paciente</span><span>Lado esquerdo do paciente</span>
        </div>
        {rows.map((row, ri) => (
          <div key={ri} role="group" aria-label={ri === 0 ? "Arcada superior" : "Arcada inferior"} className="flex gap-0.5 sm:gap-1">
            {row.map((n, i) => {
              const c = marks[n] ?? [];
              const tone = toneOf(c);
              const label = `Dente ${n}${c.length ? ": " + c.map((x) => CONDITIONS.find((k) => k.id === x)?.label).join(", ") : ""}`;
              return (
                <button
                  key={n} type="button" ref={(el) => { refs.current[n] = el; }}
                  aria-label={label} aria-pressed={selected === n}
                  onClick={() => onSelect(n)} onKeyDown={(e) => { if (e.key.startsWith("Arrow")) { e.preventDefault(); move(n, e.key); } }}
                  className={cx("flex flex-col items-center rounded-md px-0.5 pt-1 transition hover:bg-surface-sidebar",
                    ri === 0 ? "flex-col" : "flex-col-reverse",
                    selected === n && "bg-surface-info-subtle ring-2 ring-accent",
                    i === row.length / 2 && "ml-2 sm:ml-3")}
                >
                  <ToothShape n={n} upper={ri === 0} className={tone ? fill[tone] : "fill-surface stroke-muted"} />
                  <span className="text-[11px] tabular-nums text-muted">{n}</span>
                </button>
              );
            })}
          </div>
        ))}
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-xs text-muted">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" />Saudável</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-danger" />Precisa tratar</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" />Já tratado</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-dashed border-muted" />Ausente / incluso</li>
        </ul>
      </div>
    </div>
  );
}
