"use client";

import { ask } from "@/components/confirm";
import { useMemo, useState } from "react";
import { Plus, Download } from "lucide-react";
import { api, useDb } from "@/lib/store";
import { CONVENIOS_DF, INSURER_TYPE_LABEL, normName } from "@/lib/convenios-presets";
import { procedureKey } from "@/lib/convenios";
import { BASE_PROCEDURES } from "@/lib/catalog";
import { money, parseMoney, plural } from "@/lib/format";
import type { Db, Insurer } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageSkeleton, Segmented, Select, Textarea, Toggle } from "@/components/ui";
import { BillingTab } from "@/components/convenios-billing";
import { useAction } from "@/components/toast";

type Tab = "list" | "prices" | "billing";
type Form = { id?: string; name: string; type: Insurer["type"]; ansCode: string; active: boolean; paymentDays: string; closingDay: string; gloss: string; contact: string; notes: string; suggested?: boolean };
const blank: Form = { name: "", type: "odonto", ansCode: "", active: true, paymentDays: "30", closingDay: "30", gloss: "0", contact: "", notes: "" };

export default function Page() {
  const db = useDb();
  const [tab, setTab] = useState<Tab>("list");
  if (!db) return <PageSkeleton />;
  return (
    <div className="space-y-6 pt-2">
      <Segmented<Tab> label="Seção de convênios" value={tab} onChange={setTab}
        options={[{ value: "list", label: "Convênios" }, { value: "prices", label: "Tabela de valores" }, { value: "billing", label: "Faturamento" }]} />
      {tab === "list" && <ListTab db={db} />}
      {tab === "prices" && <PricesTab db={db} />}
      {tab === "billing" && <BillingTab db={db} />}
    </div>
  );
}

function ListTab({ db }: { db: Db }) {
  const run = useAction();
  const [form, setForm] = useState<Form | null>(null);
  const sorted = [...db.insurers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
  const missing = CONVENIOS_DF.filter((p) => !db.insurers.some((i) => normName(i.name) === normName(p.name))).length;

  const toForm = (i: Insurer): Form => ({ id: i.id, name: i.name, type: i.type, ansCode: i.ansCode ?? "", active: i.active, paymentDays: String(i.paymentDays), closingDay: String(i.closingDay),
    gloss: String(i.defaultGlossPercent).replace(".", ","), contact: i.contact ?? "", notes: i.notes ?? "" });
  const save = async () => {
    if (!form) return;
    const ok = await run(() => api.insurance.saveInsurer({ id: form.id, name: form.name, type: form.type, ansCode: form.ansCode, active: form.active, paymentDays: Number(form.paymentDays),
      closingDay: Number(form.closingDay), defaultGlossPercent: Number(form.gloss.replace(",", ".")), contact: form.contact, notes: form.notes }).then(() => true), "Convênio salvo.");
    if (ok) setForm(null);
  };
  const importPreset = () => run(async () => {
    const n = await api.insurance.importPreset(CONVENIOS_DF.map((p) => ({ name: p.name, type: p.type, ans: p.ans })));
    if (!n) throw new Error("Todos os convênios da lista já estavam cadastrados.");
  }, "Convênios adicionados como inativos. Revise cada um e ative os que a clínica atende.");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setForm({ ...blank })}><Plus aria-hidden className="size-4" />Novo convênio</Button>
        <Button variant="secondary" onClick={importPreset} disabled={missing === 0}><Download aria-hidden className="size-4" />Adicionar convênios de Brasília/DF</Button>
      </div>
      <p className="text-sm text-ink-muted">A lista de Brasília/DF é uma sugestão (não existe ranking oficial dos mais usados). Chega inativa, sem registro ANS, prazos e valores: revise antes de usar.</p>
      {sorted.length === 0 ? <Empty title="Nenhum convênio cadastrado" body="Cadastre um convênio ou importe a lista sugerida de Brasília/DF." /> : (
        <ul className="grid gap-2 md:grid-cols-2">
          {sorted.map((i) => (
            <li key={i.id}>
              <Card className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate font-semibold">{i.name}</h2>
                  {i.suggested && <Badge tone="warning">Sugerido — revise</Badge>}
                </div>
                <p className="text-sm text-ink-muted">{INSURER_TYPE_LABEL[i.type]}{i.ansCode ? ` · ANS ${i.ansCode}` : ""} · paga em {i.paymentDays} dias · fecha dia {i.closingDay}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Toggle label={i.active ? "Ativo" : "Inativo"} checked={i.active} onChange={(v) => run(() => api.insurance.saveInsurer({ ...i, active: v, suggested: v ? false : i.suggested }))} />
                  <Button variant="secondary" size="sm" onClick={() => setForm(toForm(i))}>Editar</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? "Editar convênio" : "Novo convênio"}
        footer={<>
          {form?.id && <Button variant="danger" onClick={async () => { if (form.id && await ask({ title: "Excluir este convênio?", body: "A tabela de valores dele também é apagada. Os pacientes passam a constar como particulares.", confirmLabel: "Excluir convênio", danger: true })) run(async () => { await api.insurance.removeInsurer(form.id!); setForm(null); }, "Convênio excluído."); }}>Excluir</Button>}
          <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button>
        </>}>
        {form && (
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Nome" className="sm:col-span-2">{(id) => <Input id={id} value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} />}</Field>
            <Field label="Tipo">{(id) => <Select id={id} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Insurer["type"] })}>{Object.entries(INSURER_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
            <Field label="Registro ANS (opcional)">{(id) => <Input id={id} value={form.ansCode} maxLength={20} inputMode="numeric" onChange={(e) => setForm({ ...form, ansCode: e.target.value })} />}</Field>
            <Field label="Prazo de pagamento (dias)">{(id) => <Input id={id} type="number" inputMode="numeric" min={0} max={365} value={form.paymentDays} onChange={(e) => setForm({ ...form, paymentDays: e.target.value })} />}</Field>
            <Field label="Dia de fechamento do lote">{(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={31} value={form.closingDay} onChange={(e) => setForm({ ...form, closingDay: e.target.value })} />}</Field>
            <Field label="Glosa padrão esperada (%)">{(id) => <Input id={id} inputMode="decimal" value={form.gloss} onChange={(e) => setForm({ ...form, gloss: e.target.value })} />}</Field>
            <Field label="Contato">{(id) => <Input id={id} value={form.contact} maxLength={200} onChange={(e) => setForm({ ...form, contact: e.target.value })} />}</Field>
            <Field label="Observações" className="sm:col-span-2">{(id) => <Textarea id={id} value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />}</Field>
            <div className="sm:col-span-2"><Toggle label="Convênio ativo" checked={form.active} onChange={(v) => setForm({ ...form, active: v })} /></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function PricesTab({ db }: { db: Db }) {
  const [insurerId, setInsurerId] = useState("");
  const [q, setQ] = useState("");
  const procs = useMemo(() => [...BASE_PROCEDURES, ...db.customProcedures], [db.customProcedures]);
  const shown = useMemo(() => {
    const n = normName(q);
    return procs.filter((p) => !n || normName(p.name).includes(n)).slice(0, 60);
  }, [procs, q]);
  const mine = db.insurerPrices.filter((p) => p.insurerId === insurerId);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Convênio">{(id) => <Select id={id} value={insurerId} onChange={(e) => setInsurerId(e.target.value)}><option value="">Escolha…</option>{db.insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>}</Field>
        <Field label="Buscar procedimento">{(id) => <Input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: restauração, canal…" />}</Field>
      </div>
      {!insurerId ? <Empty title="Escolha um convênio" body="A tabela guarda quanto o convênio repassa por procedimento. Ela define o valor faturado nos lotes." /> : (
        <>
          <p className="text-sm text-ink-muted">{plural(mine.length, "valor cadastrado", "valores cadastrados")}. Procedimento sem valor aqui é faturado pelo preço do atendimento. Deixe em branco para remover. Mostrando até 60 resultados: use a busca.</p>
          <ul className="divide-y divide-border rounded-md border border-border">
            {shown.map((p) => <PriceRow key={`${insurerId}:${p.id}`} insurerId={insurerId} procId={p.id} name={p.name} clinic={db.prices[p.id]} current={mine.find((x) => x.procedureKey === procedureKey(p.id, p.name))?.priceCents} />)}
          </ul>
        </>
      )}
    </div>
  );
}

function PriceRow({ insurerId, procId, name, clinic, current }: { insurerId: string; procId: string; name: string; clinic?: number; current?: number }) {
  const run = useAction();
  const [v, setV] = useState(current === undefined ? "" : (current / 100).toFixed(2).replace(".", ","));
  const commit = () => {
    const cents = parseMoney(v);
    if (cents === current || (cents === undefined && current === undefined)) return;
    if (cents === undefined) run(() => api.insurance.removePrice(insurerId, procedureKey(procId, name)), "Valor removido.");
    else run(() => api.insurance.savePrice(insurerId, procedureKey(procId, name), name, cents), "Valor salvo.");
  };
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="min-w-48 flex-1">{name}{clinic ? <span className="text-ink-muted"> · particular {money(clinic)}</span> : null}</span>
      <label className="flex items-center gap-2"><span className="sr-only">Valor do convênio para {name}, em reais</span>
        <Input value={v} inputMode="decimal" placeholder="R$ 0,00" className="w-32" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} /></label>
    </li>
  );
}
