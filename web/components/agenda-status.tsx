"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { AppointmentStatus } from "@/lib/types";
import { STATUS_HINT, STATUS_LABEL, STATUS_ORDER } from "@/lib/agenda";
import { cx } from "./ui";

/** Estilo do cartão na grade. Cancelado não aparece na grade (a busca ainda o encontra). */
export const STATUS_CARD: Record<AppointmentStatus, string> = {
  to_confirm: "bg-surface-200 border border-dashed border-brand",
  confirmed: "bg-brand-soft border border-brand/35",
  waiting: "bg-warning-soft border border-warning/40",
  in_service: "bg-surface-200 border border-brand ring-1 ring-brand",
  done: "bg-success-soft border border-success/35",
  no_show: "bg-danger-soft border border-danger/35",
  cancelled: "bg-surface-300 border border-ink-muted/40",
};

/** Bolinha do status (legenda, menu e cartão). */
export const STATUS_DOT: Record<AppointmentStatus, string> = {
  to_confirm: "border-2 border-dashed border-brand bg-surface-200",
  confirmed: "bg-brand",
  waiting: "bg-warning",
  in_service: "bg-brand-violet",
  done: "bg-success",
  no_show: "bg-danger",
  cancelled: "bg-ink-muted",
};

export function StatusDot({ status, className }: { status: AppointmentStatus; className?: string }) {
  return <span aria-hidden className={cx("inline-block size-3 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

const MENU_W = 232, ITEM_H = 44;

/** Botão com bolinha e seta que abre o menu de situação do agendamento. */
export function StatusMenu({ status, who, onPick, disabled, className }: {
  status: AppointmentStatus; who: string; onPick: (s: AppointmentStatus) => void; disabled?: boolean; className?: string;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const open = pos !== null;

  const close = (refocus = true) => { setPos(null); if (refocus) trigger.current?.focus(); };
  const show = () => {
    const r = trigger.current!.getBoundingClientRect();
    const h = STATUS_ORDER.length * ITEM_H + 8;
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setPos({ top, left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)) });
  };

  useEffect(() => {
    if (!open) return;
    items.current[STATUS_ORDER.indexOf(status)]?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!trigger.current?.contains(t) && !items.current.some((i) => i?.contains(t))) setPos(null);
    };
    const away = () => setPos(null);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => { document.removeEventListener("pointerdown", onDown); window.removeEventListener("scroll", away, true); window.removeEventListener("resize", away); };
  }, [open, status]);

  const move = (e: React.KeyboardEvent, i: number) => {
    const n = STATUS_ORDER.length;
    const go = (k: number) => { e.preventDefault(); items.current[(k + n) % n]?.focus(); };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(n - 1);
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === "Tab") close(false);
  };

  return (
    <>
      <button ref={trigger} type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open}
        aria-label={`Situação de ${who}: ${STATUS_LABEL[status]}. Alterar`}
        onClick={(e) => { e.stopPropagation(); if (open) close(false); else show(); }}
        onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); show(); } }}
        className={cx("flex items-center justify-center gap-0.5 rounded-sm hover:bg-surface-100/70 disabled:opacity-50", className)}>
        <StatusDot status={status} />
        <ChevronDown aria-hidden className="size-3.5 text-ink-muted" />
      </button>
      {open && createPortal(
        <div role="menu" aria-label={`Situação de ${who}`} style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_W }}
          className="z-[70] rounded-md border border-border-strong bg-surface-200 p-1 shadow-md">
          {STATUS_ORDER.map((s, i) => (
            <button key={s} ref={(el) => { items.current[i] = el; }} type="button" role="menuitemradio" aria-checked={s === status}
              onKeyDown={(e) => move(e, i)}
              onClick={() => { close(); if (s !== status) onPick(s); }}
              style={{ height: ITEM_H }}
              className={cx("flex w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-surface-300", s === status && "bg-brand-soft font-semibold")}>
              <StatusDot status={s} className="size-3.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-sm leading-4">{STATUS_LABEL[s]}</span>
                <span className="block truncate text-[11px] leading-3 text-ink-muted">{STATUS_HINT[s]}</span>
              </span>
            </button>
          ))}
        </div>, document.body)}
    </>
  );
}
