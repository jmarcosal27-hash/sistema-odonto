"use client";

import { useState } from "react";
import type { Budget, Db, PaymentMethod } from "@/lib/types";
import { api, itemTotal, splitInstallments, PAYMENT_METHODS, regionLabel } from "@/lib/store";
import { money, todayISO } from "@/lib/format";
import { PHASES } from "@/lib/catalog";
import { Modal, Button, Field, Input, Select, Toggle } from "./ui";
import { useAction } from "./toast";

export function AuthorizeDialog({ db, budget, onClose }: { db: Db; budget: Budget; onClose: () => void }) {
  const plan = db.plans.find((p) => p.id === budget.planId);
  const [picked, setPicked] = useState<string[]>(() => plan?.items.map((i) => i.id) ?? []);
  const [n, setN] = useState(1);
  const [firstDue, setFirstDue] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>(plan?.paymentMethods?.[0] ?? "pix");
  const [paidNow, setPaidNow] = useState(true);
  const run = useAction();
  if (!plan) return null;
  const total = api.budgets.approvedTotal(db, budget.id, picked);
  const parts = splitInstallments(total, n);
  const allowed = plan.paymentMethods?.length ? PAYMENT_METHODS.filter((m) => plan.paymentMethods!.includes(m.id)) : PAYMENT_METHODS;

  return (
    <Modal open onClose={onClose} wide title="Aprovar orçamento" subtitle="Escolha o que o paciente aprovou e como vai pagar. Os itens marcados viram atendimentos em andamento."
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button disabled={!picked.length} onClick={async () => {
          await run(() => api.budgets.authorize(budget.id, picked, { installments: n, firstDue, method, paidNow }),
            picked.length === plan.items.length ? "Orçamento aprovado." : "Aprovado em parte.");
          onClose();
        }}>Aprovar {money(total)}{n > 1 ? ` em ${n}x` : ""}</Button>
      </>}>
      <div className="space-y-5">
        <fieldset>
          <legend className="text-xs font-semibold text-muted mb-2">Itens</legend>
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
                    <span className="block text-sm font-medium truncate">{i.procedureName}{(i.quantity ?? 1) > 1 ? ` ×${i.quantity}` : ""}</span>
                    <span className="block text-xs text-muted">{i.tooth ? `Dente ${i.tooth} · ` : i.region ? `${regionLabel(i.region)} · ` : ""}{PHASES.find((p) => p.id === i.phase)?.label}</span>
                  </span>
                  <span className="text-sm tabular-nums">{i.priceCents !== undefined ? money(itemTotal(i)) : "a definir"}</span>
                </label>
              </li>
            ))}
          </ul>
          {!!budget.discountCents && <p className="mt-2 text-xs text-muted">Desconto de {money(budget.discountCents)} aplicado proporcionalmente aos itens aprovados.</p>}
        </fieldset>

        <fieldset className="space-y-3 rounded-md bg-surface-sidebar p-4">
          <legend className="sr-only">Pagamento</legend>
          <p className="text-sm font-semibold">Pagamento</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Parcelas">{(id) => <Select id={id} value={n} onChange={(e) => setN(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x === 1 ? "À vista" : `${x}x de ${money(Math.floor(total / x))}`}</option>)}</Select>}</Field>
            <Field label={n === 1 ? "Vencimento" : "1º vencimento"}>{(id) => <Input id={id} type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />}</Field>
            <Field label="Forma">{(id) => <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{allowed.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
          </div>
          <Toggle checked={paidNow} onChange={setPaidNow} label={n === 1 ? "Já recebi" : "Entrada (1ª parcela) já recebida"} hint="Marca a primeira parcela como paga hoje." />
          {n > 1 && <p className="text-xs text-muted">{parts.map((v, i) => `${i + 1}ª ${money(v)}`).join(" · ")}</p>}
        </fieldset>
      </div>
    </Modal>
  );
}
