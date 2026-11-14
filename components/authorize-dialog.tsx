"use client";

import { useState } from "react";
import type { Budget, Db } from "@/lib/types";
import { api } from "@/lib/store";
import { money } from "@/lib/format";
import { PHASES } from "@/lib/catalog";
import { Modal, Button } from "./ui";
import { useAction } from "./toast";

export function AuthorizeDialog({ db, budget, onClose }: { db: Db; budget: Budget; onClose: () => void }) {
  const plan = db.plans.find((p) => p.id === budget.planId);
  const [picked, setPicked] = useState<string[]>(() => plan?.items.map((i) => i.id) ?? []);
  const run = useAction();
  if (!plan) return null;
  const total = plan.items.filter((i) => picked.includes(i.id)).reduce((s, i) => s + (i.priceCents ?? 0), 0);

  return (
    <Modal open onClose={onClose} title="O que o paciente aprovou?" subtitle="Desmarque o que ficou de fora. Os itens marcados viram atendimentos em andamento."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!picked.length} onClick={async () => {
          await run(() => api.budgets.authorize(budget.id, picked), picked.length === plan.items.length ? "Orçamento aprovado." : "Aprovado em parte.");
          onClose();
        }}>Aprovar {money(total)}</Button>
      </>}>
      <fieldset>
        <legend className="sr-only">Itens do orçamento</legend>
        <div className="mb-2 flex gap-3 text-sm">
          <button type="button" className="font-semibold text-accent" onClick={() => setPicked(plan.items.map((i) => i.id))}>Marcar todos</button>
          <button type="button" className="font-semibold text-accent" onClick={() => setPicked([])}>Desmarcar todos</button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {plan.items.map((i) => (
            <li key={i.id}>
              <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={picked.includes(i.id)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{i.procedureName}</span>
                  <span className="block text-xs text-muted">{i.tooth ? `Dente ${i.tooth} · ` : ""}{PHASES.find((p) => p.id === i.phase)?.label}</span>
                </span>
                <span className="text-sm tabular-nums">{i.priceCents !== undefined ? money(i.priceCents) : "a definir"}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </Modal>
  );
}
