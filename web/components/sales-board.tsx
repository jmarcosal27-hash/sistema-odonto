"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { GripVertical } from "lucide-react";
import type { Opportunity, SalesStage } from "@/lib/types";
import { dateBR, money } from "@/lib/format";
import { Badge, Select, cx } from "./ui";

export const oppButtonId = (id: string) => `opp-open-${id}`;

/**
 * Quadro kanban. Três formas de mover um cartão, todas chamando `onMove`:
 *  - arrastar e soltar (mouse);
 *  - seletor "Mover para" dentro do cartão (teclado, leitor de tela e toque);
 *  - Shift + seta para a esquerda ou direita com o cartão focado.
 * Em telas estreitas as colunas rolam na horizontal dentro do quadro, sem alargar a página.
 */
export function SalesBoard({ stages, byStage, patientName, onOpen, onMove }: {
  stages: SalesStage[];
  byStage: Map<string, Opportunity[]>;
  patientName: (id: string) => string;
  onOpen: (o: Opportunity) => void;
  onMove: (o: Opportunity, stageId: string, viaKeyboard: boolean) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const focusAfter = useRef<string | null>(null);

  // Mover pelo teclado remonta o cartão em outra coluna: devolve o foco a ele.
  useEffect(() => {
    if (!focusAfter.current) return;
    document.getElementById(oppButtonId(focusAfter.current))?.focus();
    focusAfter.current = null;
  });

  const move = (o: Opportunity, stageId: string, viaKeyboard: boolean) => {
    if (viaKeyboard) focusAfter.current = o.id;
    onMove(o, stageId, viaKeyboard);
  };

  const onKey = (e: KeyboardEvent, o: Opportunity) => {
    if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const i = stages.findIndex((s) => s.id === o.stageId) + (e.key === "ArrowLeft" ? -1 : 1);
    if (stages[i]) move(o, stages[i].id, true);
  };

  const drop = (e: DragEvent, stageId: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null); setDragId(null);
    for (const list of byStage.values()) { const o = list.find((x) => x.id === id); if (o && o.stageId !== stageId) move(o, stageId, false); }
  };

  return (
    <div role="region" aria-label="Funil de vendas, colunas com rolagem horizontal" tabIndex={0} className="flex max-w-full gap-3 overflow-x-auto pb-3">
      {stages.map((st) => {
        const cards = byStage.get(st.id) ?? [];
        const total = cards.reduce((s, o) => s + o.valueCents, 0);
        const headId = `col-${st.id}`;
        return (
          <section key={st.id} aria-labelledby={headId}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(st.id); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null); }}
            onDrop={(e) => drop(e, st.id)}
            className={cx("w-72 shrink-0 rounded-lg border-2 p-3 transition-colors duration-150", overStage === st.id ? "border-brand bg-brand-soft" : "border-transparent bg-surface-300/60")}>
            <header className="mb-3 px-1">
              <div className="flex items-center justify-between gap-2">
                <h2 id={headId} className="truncate text-sm font-semibold">{st.name}</h2>
                <span className="grid h-6 min-w-6 place-items-center rounded-pill bg-surface-100 px-2 text-xs font-semibold" aria-label={`${cards.length} ${cards.length === 1 ? "oportunidade" : "oportunidades"}`}>{cards.length}</span>
              </div>
              <p className="text-sm font-bold tabular-nums">{money(total)}</p>
            </header>
            {cards.length === 0 ? (
              <p className="rounded-md border border-dashed border-border-strong px-3 py-6 text-center text-xs text-ink-muted">Nenhuma oportunidade aqui.</p>
            ) : (
              <ul className="space-y-2">
                {cards.map((o) => (
                  <li key={o.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    className={cx("rounded-md border border-border bg-surface-200 p-3 shadow-sm", dragId === o.id && "opacity-50")}>
                    <div className="flex items-start gap-1">
                      <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 cursor-grab text-ink-muted" />
                      <button id={oppButtonId(o.id)} type="button" onClick={() => onOpen(o)} onKeyDown={(e) => onKey(e, o)}
                        aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
                        className="min-h-10 min-w-0 flex-1 rounded-sm text-left">
                        <span className="block truncate font-semibold">{o.title}</span>
                        <span className="block truncate text-sm">{patientName(o.patientId)}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                          <span className="font-bold tabular-nums text-ink">{money(o.valueCents)}</span>
                          <span>{dateBR(o.createdAt)}</span>
                          <span className="truncate">{o.responsible ?? "Sem responsável"}</span>
                        </span>
                        {(o.label || o.budgetId) && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {o.budgetId && <Badge tone="info">Orçamento</Badge>}
                            {o.label && <Badge tone="accent">{o.label}</Badge>}
                          </span>
                        )}
                      </button>
                    </div>
                    <label className="mt-2 block text-xs text-ink-muted">
                      <span className="mb-1 block">Mover para</span>
                      <Select value={o.stageId} aria-label={`Etapa de ${o.title}, ${patientName(o.patientId)}`} className="h-10 text-sm"
                        onChange={(e) => move(o, e.target.value, true)}>
                        {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </Select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
