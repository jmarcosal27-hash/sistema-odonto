"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { CircleCheck, CircleX, DollarSign, GripVertical, ListTodo, MoreVertical, Plus, type LucideIcon } from "lucide-react";
import type { Opportunity, SalesStage, SalesStageKind } from "@/lib/types";
import { dateBR, money } from "@/lib/format";
import { Badge, Select, cx } from "./ui";

export const oppButtonId = (id: string) => `opp-open-${id}`;

// Classes completas (Tailwind só gera o que aparece escrito). Cores vêm dos tokens, valem nos dois temas.
const TONE: Record<SalesStageKind, { icon: LucideIcon; title: string; strip: string; card: string; meta: string; help: string }> = {
  open: { icon: ListTodo, title: "text-stage-blue", strip: "bg-stage-teal", card: "bg-surface-100", meta: "text-ink-muted", help: "Todo orçamento criado entra aqui. Mova a oportunidade quando o paciente avançar." },
  in_progress: { icon: ListTodo, title: "text-stage-blue", strip: "bg-stage-teal", card: "bg-surface-100", meta: "text-ink-muted", help: "Mova as oportunidades para essa etapa após concluir a etapa anterior." },
  won: { icon: CircleCheck, title: "text-success", strip: "bg-stage-gray", card: "bg-success-soft", meta: "text-success", help: "Mova as oportunidades para essa etapa quando o paciente aprovar o orçamento." },
  lost: { icon: CircleX, title: "text-danger", strip: "bg-danger", card: "bg-danger-soft", meta: "text-danger", help: "Mova as oportunidades para essa etapa quando o paciente não aprovar o orçamento." },
};

/**
 * Quadro kanban. Três formas de mover um cartão, todas chamando `onMove`:
 *  - arrastar e soltar (mouse);
 *  - seletor "Mover para" dentro do cartão (teclado, leitor de tela e toque);
 *  - Shift + seta para a esquerda ou direita com o cartão focado.
 * Em telas estreitas as colunas rolam na horizontal dentro do quadro, sem alargar a página.
 */
export function SalesBoard({ stages, byStage, patientName, onOpen, onMove, onManageStages }: {
  stages: SalesStage[];
  byStage: Map<string, Opportunity[]>;
  patientName: (id: string) => string;
  onOpen: (o: Opportunity) => void;
  onMove: (o: Opportunity, stageId: string, viaKeyboard: boolean) => void;
  /** Se informado, mostra o menu da coluna e o botão "Criar nova etapa" (abre a edição de etapas). */
  onManageStages?: () => void;
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
        const tone = TONE[st.kind ?? "in_progress"];
        const StageIcon = tone.icon;
        return (
          <section key={st.id} aria-labelledby={headId}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(st.id); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null); }}
            onDrop={(e) => drop(e, st.id)}
            className={cx("w-72 shrink-0 rounded-lg border-2 p-3 transition-colors duration-150", overStage === st.id ? "border-brand bg-brand-soft" : "border-transparent bg-surface-300")}>
            <header className="mb-3 px-1">
              <div className="flex items-center justify-between gap-2">
                <h2 id={headId} className={cx("flex min-w-0 items-center gap-2 text-sm font-bold", tone.title)}>
                  <StageIcon aria-hidden className="size-5 shrink-0" /><span className="truncate">{st.name}</span>
                </h2>
                {onManageStages && (
                  <button type="button" onClick={onManageStages} aria-label={`Opções da etapa ${st.name}: editar etapas`} title="Editar etapas"
                    className="grid size-8 shrink-0 place-items-center rounded-pill text-ink-muted transition-colors duration-150 hover:bg-surface-100">
                    <MoreVertical aria-hidden className="size-4" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-muted tabular-nums">
                <span aria-label={`${cards.length} ${cards.length === 1 ? "oportunidade" : "oportunidades"}`}>{cards.length}</span>
                <span aria-hidden> | </span><span className="font-semibold text-ink">{money(total)}</span>
              </p>
            </header>
            {cards.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-muted">{tone.help}</p>
            ) : (
              <ul className="space-y-2">
                {cards.map((o) => (
                  <li key={o.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setDragId(o.id); }}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    className={cx("flex overflow-hidden rounded-md border border-border shadow-sm", tone.card, dragId === o.id && "opacity-50")}>
                    <div aria-hidden className={cx("grid w-9 shrink-0 place-items-start justify-center pt-3 text-surface-100", tone.strip)}><DollarSign className="size-4" /></div>
                    <div className="min-w-0 flex-1 p-3">
                    <div className="flex items-start gap-1">
                      <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 cursor-grab text-ink-muted" />
                      <button id={oppButtonId(o.id)} type="button" onClick={() => onOpen(o)} onKeyDown={(e) => onKey(e, o)}
                        aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight"
                        className="min-h-10 min-w-0 flex-1 rounded-sm text-left">
                        <span className="block truncate font-semibold">{o.title}</span>
                        <span className="block truncate text-sm">{patientName(o.patientId)}</span>
                        <span className={cx("mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs", tone.meta)}>
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
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {onManageStages && (
        <div className="w-72 shrink-0 rounded-lg bg-surface-300/60 p-3">
          <button type="button" onClick={onManageStages} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-bold text-stage-blue hover:underline"><Plus aria-hidden className="size-4" />Criar nova etapa</button>
        </div>
      )}
    </div>
  );
}
