"use client";

import { useSyncExternalStore } from "react";

/**
 * Exclusão com "Desfazer": o item some da tela na hora e só é apagado de verdade
 * depois de UNDO_MS, se ninguém desfizer. Serve para itens de baixo risco (notas, rascunhos, modelos).
 */
export const UNDO_MS = 6000;

let hidden = new Set<string>();
const subs = new Set<() => void>();
const emit = () => { hidden = new Set(hidden); subs.forEach((f) => f()); };
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const EMPTY = new Set<string>();

/** Ids escondidos aguardando a exclusão definitiva. */
export function usePendingRemoval() {
  return useSyncExternalStore(subscribe, () => hidden, () => EMPTY);
}

type Toast = (text: string, tone?: "ok" | "error", opts?: { action?: { label: string; onClick: () => void }; ms?: number }) => void;

export function removeWithUndo(id: string, text: string, remove: () => Promise<unknown>, toast: Toast) {
  hidden.add(id); emit();
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    try { await remove(); }
    catch (e) { toast(e instanceof Error ? e.message : "Não deu para excluir.", "error"); }
    finally { hidden.delete(id); emit(); }
  }, UNDO_MS);
  toast(text, "ok", { ms: UNDO_MS, action: { label: "Desfazer", onClick: () => { undone = true; clearTimeout(timer); hidden.delete(id); emit(); } } });
}
