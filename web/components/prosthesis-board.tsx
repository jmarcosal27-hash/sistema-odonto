"use client";

import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { CalendarClock, CircleCheck, ClipboardList, FlaskConical, GripVertical, Send, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ProsthesisJob, ProsthesisStage } from "@/lib/types";
import { STAGES, isOverdue, kindName } from "@/lib/prosthesis";
import { dateBR } from "@/lib/format";
import { Badge, Select, cx } from "./ui";

export const jobButtonId = (id: string) => `job-open-${id}`;

// Cor distinta por etapa, via tokens (claro e escuro). Atrasado sobrepõe a faixa em vermelho.
const TONE: Record<ProsthesisStage, { icon: LucideIcon; title: string; strip: string; card: string }> = {
  pre_lab: { icon: ClipboardList, title: "text-stage-gray", strip: "bg-stage-gray", card: "bg-surface-100" },
  sent: { icon: Send, title: "text-stage-amber", strip: "bg-stage-amber", card: "bg-surface-100" },
  lab: { icon: FlaskConical, title: "text-stage-violet", strip: "bg-stage-violet", card: "bg-surface-100" },
  scheduled: { icon: CalendarClock, title: "text-stage-blue", strip: "bg-stage-blue", card: "bg-surface-100" },
  done: { icon: CircleCheck, title: "text-success", strip: "bg-success", card: "bg-success-soft" },
};

/**
 * Quadro kanban do controle de prótese. Três formas de mover um cartão, todas chamando `onMove`:
 * arrastar e soltar, seletor "Mover para" dentro do cartão e Shift + seta esquerda ou direita com o cartão focado.
 * Em telas estreitas as colunas rolam na horizontal dentro do quadro, sem alargar a página.
 */
export function ProsthesisBoard({ byStage, today, patientName, labName, onOpen, onMove }: {
  byStage: Map<ProsthesisStage, ProsthesisJob[]>;
  today: string;
  patientName: (id: string) => string;
  labName: (id?: string) => string | undefined;
  onOpen: (j: ProsthesisJob) => void;
  onMove: (j: ProsthesisJob, stage: ProsthesisStage) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<ProsthesisStage | null>(null);
  const focusAfter = useRef<string | null>(null);

  // Mover pelo teclado remonta o cartão em outra coluna: devolve o foco a ele.
  useEffect(() => {
    if (!focusAfter.current) return;
    document.getElementById(jobButtonId(focusAfter.current))?.focus();
    focusAfter.current = null;
  });

  const move = (j: ProsthesisJob, stage: ProsthesisStage, viaKeyboard: boolean) => {
    if (viaKeyboard) focusAfter.current = j.id;
    onMove(j, stage);
  };

  const onKey = (e: KeyboardEvent, j: ProsthesisJob) => {
    if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const i = STAGES.findIndex((s) => s.id === j.stage) + (e.key === "ArrowLeft" ? -1 : 1);
    if (STAGES[i]) move(j, STAGES[i].id, true);
  };

  const drop = (e: DragEvent, stage: ProsthesisStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || dragId;
    setOverStage(null); setDragId(null);
    for (const list of byStage.values()) { const j = list.find((x) => x.id === id); if (j && j.stage !== stage) move(j, stage, false); }
  };

  return (
    <div role="region" aria-label="Controle de prótese, colunas com rolagem horizontal" tabIndex={0} className="flex max-w-full gap-3 overflow-x-auto pb-3">
      {STAGES.map((st) => {
        const cards = byStage.get(st.id) ?? [];
        const late = cards.filter((j) => isOverdue(j, today)).length;
        const headId = `col-${st.id}`;
        const tone = TONE[st.id];
        const StageIcon = tone.icon;
        return (
          <section key={st.id} aria-labelledby={headId}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverStage(st.id); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null); }}
            onDrop={(e) => drop(e, st.id)}
            className={cx("w-72 shrink-0 rounded-lg border-2 p-3 transition-colors duration-150", overStage === st.id ? "border-brand bg-brand-soft" : "border-transparent bg-surface-300")}>
            <header className="mb-3 flex items-center justify-between gap-2 px-1">
              <h2 id={headId} className={cx("flex min-w-0 items-center gap-2 text-sm font-bold", tone.title)}><StageIcon aria-hidden className="size-5 shrink-0" /><span className="truncate">{st.name}</span></h2>
              <span className="flex items-center gap-1.5">
                {late > 0 && (
                  <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-danger-soft px-2 text-xs font-semibold text-danger" aria-label={`${late} ${late === 1 ? "atrasado" : "atrasados"}`}>
                    <TriangleAlert aria-hidden className="size-3.5" />{late}
                  </span>
                )}
                <span className="grid h-6 min-w-6 place-items-center rounded-pill bg-surface-100 px-2 text-xs font-semibold" aria-label={`${cards.length} ${cards.length === 1 ? "serviço" : "serviços"}`}>{cards.length}</span>
              </span>
            </header>
            {cards.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-ink-muted">Nenhum serviço nesta etapa. Mova os serviços para cá conforme avançam.</p>
            ) : (
              <ul className="space-y-2">
                {cards.map((j) => {
                  const overdue = isOverdue(j, today);
                  const lab = labName(j.laboratoryId);
                  return (
                    <li key={j.id} draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", j.id); e.dataTransfer.effectAllowed = "move"; setDragId(j.id); }}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      className={cx("flex overflow-hidden rounded-md border shadow-sm", tone.card, overdue ? "border-danger" : "border-border", dragId === j.id && "opacity-50")}>
                      <div aria-hidden className={cx("grid w-9 shrink-0 place-items-start justify-center pt-3 text-surface-100", overdue ? "bg-danger" : tone.strip)}>{overdue ? <TriangleAlert className="size-4" /> : <StageIcon className="size-4" />}</div>
                      <div className="min-w-0 flex-1 p-3">
                      <div className="flex items-start gap-1">
                        <GripVertical aria-hidden className="mt-0.5 size-4 shrink-0 cursor-grab text-ink-muted" />
                        <button id={jobButtonId(j.id)} type="button" onClick={() => onOpen(j)} onKeyDown={(e) => onKey(e, j)}
                          aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight" className="min-h-10 min-w-0 flex-1 rounded-sm text-left">
                          <span className="block truncate font-semibold">{patientName(j.patientId)}</span>
                          <span className="block truncate text-sm">{kindName(j.kind)}: {j.description}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                            <span className="truncate">{lab ?? "Sem laboratório"}</span>
                            {j.dueOn && <span className={cx("tabular-nums", overdue && "font-bold text-danger")}>Previsto {dateBR(j.dueOn)}</span>}
                          </span>
                          {(overdue || j.isReturn || j.label) && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {overdue && <Badge tone="danger">Atrasado</Badge>}
                              {j.isReturn && <Badge tone="warning">Retorno</Badge>}
                              {j.label && <Badge tone="accent">{j.label}</Badge>}
                            </span>
                          )}
                        </button>
                      </div>
                      <label className="mt-2 block text-xs text-ink-muted">
                        <span className="mb-1 block">Mover para</span>
                        <Select value={j.stage} aria-label={`Etapa do serviço de ${patientName(j.patientId)}: ${j.description}`} className="h-10 text-sm"
                          onChange={(e) => move(j, e.target.value as ProsthesisStage, true)}>
                          {STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </Select>
                      </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
