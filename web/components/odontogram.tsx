"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import type { ToothCondition } from "@/lib/types";
import { CONDITION_META, conditionAbbr, conditionMeta, toggleCondition } from "@/lib/teeth";
import { ToothSvg } from "./tooth-svg";
import { cx } from "./ui";

export function Odontogram({ upper, lower, marks, planned, onConditions, onSelect }: {
  upper: number[]; lower: number[];
  marks: Record<number, ToothCondition[]>;
  /** Dentes que já têm procedimento no plano (ganham o traço vermelho). */
  planned?: ReadonlySet<number>;
  /** Aplica/remove condições do dente (o desenho muda na hora). */
  onConditions: (tooth: number, conditions: ToothCondition[]) => void;
  /** Abre o diálogo de procedimento do dente. */
  onSelect: (n: number) => void;
}) {
  const refs = useRef<Record<number, HTMLButtonElement | null>>({});
  const [active, setActive] = useState<number | undefined>();
  const rows = [upper, lower].filter((r) => r.length);
  const current = active !== undefined && rows.some((r) => r.includes(active)) ? active : undefined;
  const activeConditions = current !== undefined ? marks[current] ?? [] : [];

  const move = (n: number, key: string) => {
    const r = rows.findIndex((row) => row.includes(n));
    const i = rows[r].indexOf(n);
    let target: number | undefined;
    if (key === "ArrowRight") target = rows[r][i + 1];
    if (key === "ArrowLeft") target = rows[r][i - 1];
    if (key === "ArrowDown" && r === 0 && rows[1]) target = rows[1][Math.min(i, rows[1].length - 1)];
    if (key === "ArrowUp" && r === 1) target = rows[0][Math.min(i, rows[0].length - 1)];
    if (target !== undefined) { refs.current[target]?.focus(); setActive(target); }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <div className="mx-auto w-max space-y-3 rounded-xl bg-[#f4f7fb] px-2 py-3 text-slate-700 ring-1 ring-slate-300/60">
          <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>Direita do paciente</span><span>Esquerda do paciente</span>
          </div>
          {rows.map((row, ri) => (
            <div key={ri} role="group" aria-label={row === upper ? "Arcada superior" : "Arcada inferior"} className="flex gap-0.5 sm:gap-1">
              {row.map((n, i) => {
                const c = marks[n] ?? [];
                const names = c.map((x) => conditionMeta(x)?.label).join(", ");
                return (
                  <button
                    key={n} type="button" ref={(el) => { refs.current[n] = el; }}
                    aria-label={`Dente ${n}${names ? ": " + names : ""}${planned?.has(n) ? ", com procedimento no plano" : ""}`}
                    aria-pressed={current === n}
                    onClick={() => setActive(n)}
                    onKeyDown={(e) => { if (e.key.startsWith("Arrow")) { e.preventDefault(); move(n, e.key); } }}
                    className={cx("flex w-9 sm:w-11 flex-col items-center justify-start rounded-md px-0.5 py-1 transition hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-brand",
                      current === n && "bg-sky-100 ring-2 ring-brand",
                      i === row.length / 2 && "ml-2 sm:ml-3")}
                  >
                    <ToothSvg n={n} conditions={c} className="h-auto w-full overflow-visible" />
                    <span className="mt-1 text-[11px] font-medium leading-none tabular-nums text-slate-800">{n}</span>
                    <span className="mt-0.5 h-3 text-[11px] leading-3 font-semibold text-ink-muted">{conditionAbbr(c)}</span>
                    <span aria-hidden className={cx("mt-0.5 h-0.5 w-5 rounded-full", planned?.has(n) ? "bg-danger" : "bg-transparent")} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted" aria-live="polite">
          {current === undefined ? "Escolha um dente e depois a condição abaixo." : `Dente ${current} selecionado. Toque numa condição para marcar ou desmarcar.`}
        </p>
        {current !== undefined && (
          <button type="button" onClick={() => onSelect(current)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-semibold text-white">
            <Plus className="size-4" />Procedimento no dente {current}
          </button>
        )}
      </div>

      <ul role="group" aria-label="Condições do dente" className="flex flex-wrap gap-1.5">
        {CONDITION_META.map((k) => {
          const on = activeConditions.includes(k.id);
          return (
            <li key={k.id}>
              <button type="button" aria-pressed={on} disabled={current === undefined}
                onClick={() => current !== undefined && onConditions(current, toggleCondition(activeConditions, k.id))}
                className={cx("inline-flex h-9 items-center gap-1.5 rounded-pill border px-2.5 text-xs transition disabled:opacity-50",
                  on ? "border-ink bg-surface-300 font-semibold" : "border-border-strong hover:bg-surface-300")}>
                <span aria-hidden className="grid min-w-5 place-items-center rounded-sm px-1 text-[11px] font-bold text-white" style={{ background: k.color }}>{k.abbr}</span>
                {k.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
