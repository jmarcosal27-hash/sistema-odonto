"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Action = { label: string; onClick: () => void };
type Opts = { action?: Action; ms?: number };
type Toast = { id: number; text: string; tone: "ok" | "error"; action?: Action };
const Ctx = createContext<(text: string, tone?: Toast["tone"], opts?: Opts) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const drop = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok", opts?: Opts) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone, action: opts?.action }]);
    setTimeout(() => drop(id), opts?.ms ?? (opts?.action ? 6000 : 3500));
  }, [drop]);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="fixed bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[min(92vw,420px)]">
        {items.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
            className={`flex items-center gap-3 rounded-md px-4 py-3 text-sm font-medium shadow-md ${t.tone === "error" ? "bg-danger text-on-brand" : "bg-ink text-surface-100"}`}>
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action!.onClick(); drop(t.id); }}
                className="-my-1 shrink-0 rounded-sm px-2 py-1 text-sm font-semibold underline underline-offset-2 hover:bg-white/10">{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

/** Roda uma ação da camada de dados e mostra o erro como toast em vez de quebrar a tela. */
export function useAction() {
  const toast = useToast();
  return useCallback(async <T,>(fn: () => Promise<T>, okText?: string): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (okText) toast(okText);
      return r;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Algo deu errado.", "error");
      return undefined;
    }
  }, [toast]);
}
