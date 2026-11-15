"use client";

import { useState } from "react";
import type { Db, HofFace, HofShape, HofUnit, PlanItem } from "@/lib/types";
import { HOF_SPECIALTY_ID } from "@/lib/catalog";
import { HOF_SUGGESTED_PRICES, HOF_UNITS, hofRegionLabel } from "@/lib/hof";
import { allProcedures } from "@/lib/store";
import { parseMoney, uid } from "@/lib/format";
import { Button, Field, Input, Modal, Select } from "./ui";

const asMoney = (c: number | undefined) => (c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

/** Dados do item de HOF; as regiões e o desenho vêm do faceograma. */
export function HofDialog({ db, open, onClose, face, regions, marks, onAdd }: {
  db: Db; open: boolean; onClose: () => void; face: HofFace; regions: string[]; marks: HofShape[]; onAdd: (item: PlanItem) => void;
}) {
  const procs = allProcedures(db).filter((p) => p.specialtyId === HOF_SPECIALTY_ID);
  const priceOf = (id: string) => { const p = procs.find((x) => x.id === id); return db.prices[id] ?? (p ? HOF_SUGGESTED_PRICES[p.name] : undefined); };
  const [procId, setProcId] = useState(procs[0]?.id ?? "");
  const [price, setPrice] = useState(asMoney(procs[0] ? priceOf(procs[0].id) : undefined));
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<HofUnit>("U");
  const [dentist, setDentist] = useState(db.profile.professionalName ?? "");
  const amountN = Number(amount.replace(",", "."));
  const hasAmount = amount.trim() !== "";
  const amountOk = !hasAmount || (Number.isFinite(amountN) && amountN > 0 && amountN <= 9999);
  const proc = procs.find((p) => p.id === procId);
  const ready = !!proc && regions.length > 0 && amountOk;

  const choose = (id: string) => { setProcId(id); setPrice(asMoney(priceOf(id))); };
  const add = () => {
    if (!proc || !ready) return;
    onAdd({
      id: uid(), hof: true, hofFace: face, hofRegions: regions, hofMarks: marks, conditions: [], procedureId: proc.id, procedureName: proc.name,
      phase: "esthetic", priceCents: parseMoney(price), quantity: 1, dentistName: dentist.trim() || undefined,
      ...(hasAmount ? { productAmount: Math.round(amountN * 100) / 100, productUnit: unit } : {}),
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Procedimento de HOF" subtitle="Região e desenho vêm do faceograma; aqui entram produto, valor e profissional."
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button onClick={add} disabled={!ready}>Adicionar ao plano</Button></>}>
      <div className="space-y-4">
        <Field label="Procedimento">{(id) => <Select id={id} value={procId} onChange={(e) => choose(e.target.value)}>{procs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold">Região(ões)</p>
          {regions.length
            ? <p className="text-sm">{regions.map(hofRegionLabel).join(", ")}{marks.length ? ` · ${marks.length} ${marks.length === 1 ? "marcação" : "marcações"} no desenho` : ""}</p>
            : <p role="alert" className="text-sm font-semibold text-danger">Feche e escolha ao menos uma região no faceograma.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Quantidade de produto" error={amountOk ? undefined : "Use um número entre 0 e 9999."} hint="Opcional. Ex.: 20 U de toxina, 1 mL de preenchedor.">
            {(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={amount} invalid={!amountOk} onChange={(e) => setAmount(e.target.value)} placeholder="0" />}
          </Field>
          <Field label="Unidade">{(id) => <Select id={id} value={unit} onChange={(e) => setUnit(e.target.value as HofUnit)}>{HOF_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</Select>}</Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" hint="Em branco = definir depois">{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />}</Field>
          <Field label="Dentista">{(id) => <Input id={id} value={dentist} maxLength={120} onChange={(e) => setDentist(e.target.value)} placeholder="Nome do profissional" />}</Field>
        </div>
      </div>
    </Modal>
  );
}
