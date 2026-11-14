"use client";

import { useMemo, useState } from "react";
import type { Db, Phase, PlanItem, Region, ToothCondition } from "@/lib/types";
import { CONDITIONS, FREQUENT_PROCEDURE_NAMES, PHASES, SPECIALTIES } from "@/lib/catalog";
import { allProcedures, api } from "@/lib/store";
import { money, parseMoney, uid } from "@/lib/format";
import { Modal, Button, Field, Input, Select, cx } from "./ui";
import { useAction } from "./toast";

export function ToothDialog({ db, tooth, open, onClose, conditions, onAdd, onConditions }: {
  db: Db; tooth?: number; open: boolean; onClose: () => void;
  conditions: ToothCondition[];
  onConditions: (c: ToothCondition[]) => void;
  onAdd: (item: PlanItem) => void;
}) {
  const [q, setQ] = useState("");
  const [chosen, setChosen] = useState<{ id?: string; name: string } | null>(null);
  const [price, setPrice] = useState("");
  const [phase, setPhase] = useState<Phase>("rehab");
  const [qty, setQty] = useState("1");
  const [region, setRegion] = useState<Region | "">("");
  const [creating, setCreating] = useState(false);
  const [newSpec, setNewSpec] = useState(db.profile.activeSpecialtyIds[0] ?? "geral");
  const run = useAction();

  const procs = useMemo(() => allProcedures(db).filter((p) => p.custom || db.profile.activeSpecialtyIds.includes(p.specialtyId)), [db]);
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return procs.filter((p) => FREQUENT_PROCEDURE_NAMES.includes(p.name) || p.custom);
    return procs.filter((p) => p.name.toLowerCase().includes(n) || SPECIALTIES.find((s) => s.id === p.specialtyId)?.name.toLowerCase().includes(n)).slice(0, 30);
  }, [q, procs]);

  const reset = () => { setQ(""); setChosen(null); setPrice(""); setCreating(false); setQty("1"); setRegion(""); };
  const close = () => { reset(); onClose(); };

  const choose = (id: string | undefined, name: string) => {
    setChosen({ id, name });
    const def = id ? db.prices[id] : undefined;
    setPrice(def !== undefined ? (def / 100).toFixed(2).replace(".", ",") : "");
    const urgent = conditions.some((c) => c === "decayed" || c === "fractured") && /canal|extra|urg/i.test(name);
    setPhase(urgent ? "urgency" : /faceta|clare|lente/i.test(name) ? "esthetic" : /profil|raspag|selante|flúor/i.test(name) ? "oral_prep" : "rehab");
  };

  const add = () => {
    if (!chosen) return;
    const quantity = Math.max(1, Math.min(99, Number(qty) || 1));
    onAdd({ id: uid(), tooth, region: tooth ? undefined : region || undefined, conditions, procedureId: chosen.id, procedureName: chosen.name, phase, priceCents: parseMoney(price), quantity });
    reset();
  };

  const toggle = (c: ToothCondition) => onConditions(conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c]);

  return (
    <Modal open={open} onClose={close} title={tooth ? `Dente ${tooth}` : "Procedimento geral"} subtitle={tooth ? "Marque o que encontrou e, se quiser, já escolha o tratamento." : "Para itens que não são de um dente específico (limpeza, consulta, exames)."}
      footer={<><Button variant="ghost" onClick={close}>Fechar</Button><Button onClick={add} disabled={!chosen}>Adicionar ao plano</Button></>}>
      <div className="space-y-5">
        {tooth && (
          <fieldset>
            <legend className="text-xs font-semibold text-ink-muted mb-2">Situação do dente (pode marcar mais de uma)</legend>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => {
                const on = conditions.includes(c.id);
                const dot = { success: "bg-success", danger: "bg-danger", accent: "bg-brand", muted: "bg-ink-muted" }[c.tone];
                return (
                  <button key={c.id} type="button" aria-pressed={on} onClick={() => toggle(c.id)}
                    className={cx("inline-flex items-center gap-1.5 rounded-pill border h-8 px-3 text-sm transition",
                      on ? "border-ink bg-surface-300 font-semibold" : "border-border-strong")}>
                    <span aria-hidden className={cx("size-2 rounded-full", dot)} />{c.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {!chosen ? (
          <div className="space-y-2">
            <Field label="Tratamento">{(id) => <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busque por nome ou especialidade" />}</Field>
            <p className="text-xs font-semibold text-ink-muted">{q ? `${results.length} encontrados` : "Os mais comuns"}</p>
            <ul className="max-h-60 overflow-y-auto divide-y divide-border rounded-md border border-border">
              {results.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => choose(p.id, p.name)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-surface-300">
                    <span>
                      <span className="block text-sm font-medium">{p.name}</span>
                      <span className="block text-xs text-ink-muted">{p.custom ? "Seu procedimento" : SPECIALTIES.find((s) => s.id === p.specialtyId)?.name}</span>
                    </span>
                    <span className="text-xs text-ink-muted whitespace-nowrap">{db.prices[p.id] !== undefined ? money(db.prices[p.id]) : "sem preço"}</span>
                  </button>
                </li>
              ))}
              {!results.length && <li className="px-3 py-4 text-sm text-ink-muted">Nada encontrado. Crie o seu abaixo.</li>}
            </ul>
            {!creating
              ? <button type="button" onClick={() => setCreating(true)} className="text-sm font-semibold text-brand">+ Criar um procedimento</button>
              : <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto] items-end rounded-md bg-surface-300 p-3">
                  <Field label="Nome">{(id) => <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} />}</Field>
                  <Field label="Especialidade">{(id) => <Select id={id} value={newSpec} onChange={(e) => setNewSpec(e.target.value)}>{SPECIALTIES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}</Field>
                  <Button size="md" disabled={q.trim().length < 3} onClick={async () => {
                    const id = await run(() => api.catalog.createCustomProcedure(q.trim(), newSpec), "Procedimento criado.");
                    if (id) choose(id, q.trim());
                  }}>Criar</Button>
                </div>}
          </div>
        ) : (
          <div className="space-y-3 rounded-md bg-surface-300 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold">{chosen.name}</p>
              <button type="button" onClick={() => setChosen(null)} className="text-sm font-semibold text-brand">Trocar</button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_90px_1fr]">
              <Field label="Valor unitário (R$)" hint="Em branco = definir depois">{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />}</Field>
              <Field label="Qtd.">{(id) => <Input id={id} type="number" min={1} max={99} value={qty} onChange={(e) => setQty(e.target.value)} />}</Field>
              <Field label="Etapa">{(id) => <Select id={id} value={phase} onChange={(e) => setPhase(e.target.value as Phase)}>{PHASES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</Select>}</Field>
            </div>
            {!tooth && (
              <Field label="Região">{(id) => <Select id={id} value={region} onChange={(e) => setRegion(e.target.value as Region | "")}>
                <option value="">Geral (boca toda / sem região)</option><option value="upper">Arcada superior</option><option value="lower">Arcada inferior</option><option value="both">Ambas as arcadas</option>
              </Select>}</Field>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
