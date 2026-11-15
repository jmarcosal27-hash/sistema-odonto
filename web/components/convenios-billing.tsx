"use client";

import { useMemo, useState } from "react";
import { Download, Send, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/store";
import { batchCsv, batchTotals, BATCH_STATUS_LABEL, eligibleTreatments, insurerPriceFor, ITEM_STATUS_LABEL } from "@/lib/convenios";
import { dateBR, money, parseMoney, todayISO } from "@/lib/format";
import type { BillingBatch, BillingBatchStatus, BillingItem, Db } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, Input, Kpi, Select } from "./ui";
import { useAction } from "./toast";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const TONE: Record<BillingBatchStatus, "neutral" | "info" | "success" | "warning" | "danger"> = { draft: "neutral", sent: "info", paid: "success", partial: "warning", glossed: "danger" };
const reais = (c: number) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

export function BillingTab({ db }: { db: Db }) {
  const run = useAction();
  const now = new Date();
  const [openId, setOpenId] = useState<string | null>(null);
  const batches = [...db.billingBatches].sort((a, b) => b.year - a.year || b.month - a.month || b.createdAt.localeCompare(a.createdAt));
  const open = batches.find((b) => b.id === openId);
  const insName = (id: string) => db.insurers.find((i) => i.id === id)?.name ?? "Convênio removido";

  return (
    <div className="space-y-6">
      <NewBatch db={db} year={now.getFullYear()} month={now.getMonth() + 1} onCreated={setOpenId} />
      <Report db={db} />
      <section aria-labelledby="lotes" className="space-y-3">
        <h2 id="lotes" className="text-lg font-semibold">Lotes</h2>
        {batches.length === 0 ? <Empty title="Nenhum lote ainda" body="Gere o primeiro lote acima, com os atendimentos de pacientes conveniados." /> : (
          <ul className="space-y-2">
            {batches.map((b) => {
              const t = batchTotals(db.billingItems.filter((i) => i.batchId === b.id));
              return (
                <li key={b.id}>
                  <button type="button" aria-expanded={openId === b.id} onClick={() => setOpenId(openId === b.id ? null : b.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-surface-200 px-4 py-3 text-left min-h-11 hover:bg-surface-300/60">
                    <span className="min-w-40 flex-1 font-semibold">{insName(b.insurerId)} · {String(b.month).padStart(2, "0")}/{b.year}</span>
                    <Badge tone={TONE[b.status]}>{BATCH_STATUS_LABEL[b.status]}</Badge>
                    <span className="text-sm text-ink-muted">Faturado {money(t.billed)} · Pago {money(t.paid)} · Glosa {money(t.gloss)}</span>
                  </button>
                  {open?.id === b.id && <BatchDetail db={db} batch={b} run={run} onClose={() => setOpenId(null)} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function NewBatch({ db, year: y0, month: m0, onCreated }: { db: Db; year: number; month: number; onCreated: (id: string) => void }) {
  const run = useAction();
  const active = db.insurers.filter((i) => i.active);
  const [insurerId, setInsurerId] = useState("");
  const [year, setYear] = useState(y0);
  const [month, setMonth] = useState(m0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const ins = db.insurers.find((i) => i.id === insurerId);
  const list = useMemo(() => (ins ? eligibleTreatments(db, ins.id, year, month) : []), [db, ins, year, month]);
  const chosen = list.filter((t) => !skipped.has(t.id));
  const total = ins ? chosen.reduce((s, t) => s + insurerPriceFor(db, ins.id, t), 0) : 0;
  const patient = (id: string) => db.patients.find((p) => p.id === id);

  const create = async () => {
    setBusy(true);
    const id = await run(() => api.insurance.createBatch(insurerId, year, month, chosen.map((t) => t.id), db.profile.professionalName || undefined), "Lote criado.");
    setBusy(false);
    if (id) { setSkipped(new Set()); onCreated(id); }
  };

  return (
    <Card className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Novo lote de faturamento</h2>
      {active.length === 0 ? <p className="text-sm text-ink-muted">Ative ao menos um convênio na aba “Convênios” e vincule pacientes a ele (cadastro do paciente).</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Convênio">{(id) => <Select id={id} value={insurerId} onChange={(e) => { setInsurerId(e.target.value); setSkipped(new Set()); }}><option value="">Escolha…</option>{active.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select>}</Field>
            <Field label="Mês da competência">{(id) => <Select id={id} value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</Select>}</Field>
            <Field label="Ano">{(id) => <Input id={id} type="number" inputMode="numeric" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value) || y0)} />}</Field>
          </div>
          {ins && (list.length === 0 ? <p className="text-sm text-ink-muted">Nenhum atendimento concluído de pacientes deste convênio pendente de faturamento até {MONTHS[month - 1]}/{year}.</p> : (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Atendimentos a faturar ({chosen.length} de {list.length})</legend>
              <ul className="divide-y divide-border rounded-md border border-border">
                {list.map((t) => (
                  <li key={t.id}>
                    <label className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                      <input type="checkbox" className="size-5" checked={!skipped.has(t.id)} onChange={(e) => setSkipped((s) => { const n = new Set(s); if (e.target.checked) n.delete(t.id); else n.add(t.id); return n; })} />
                      <span className="flex-1">{patient(t.patientId)?.fullName} — {t.procedureName} <span className="text-ink-muted">({dateBR(t.performedAt)})</span></span>
                      <span className="font-semibold">{money(insurerPriceFor(db, ins.id, t))}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-ink-muted">Valores vêm da tabela do convênio; sem valor cadastrado, vale o preço do atendimento.</p>
            </fieldset>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={create} loading={busy} disabled={!ins || chosen.length === 0}>Gerar lote ({money(total)})</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function Report({ db }: { db: Db }) {
  const rows = db.insurers.map((ins) => {
    const batches = db.billingBatches.filter((b) => b.insurerId === ins.id);
    const sent = new Set(batches.filter((b) => b.sentOn).map((b) => b.id));
    const items = db.billingItems.filter((i) => sent.has(i.batchId));
    const t = batchTotals(items);
    const reasons = new Map<string, number>();
    items.forEach((i) => { if (i.glossCents > 0) reasons.set(i.glossReason ?? "Sem motivo", (reasons.get(i.glossReason ?? "Sem motivo") ?? 0) + i.glossCents); });
    return { ins, t, reasons: [...reasons.entries()].sort((a, b) => b[1] - a[1]), n: batches.length };
  }).filter((r) => r.n > 0);
  if (!rows.length) return null;
  const toReceive = rows.reduce((s, r) => s + r.t.open, 0);
  const gloss = rows.reduce((s, r) => s + r.t.gloss, 0);
  return (
    <section aria-labelledby="rel" className="space-y-3">
      <h2 id="rel" className="text-lg font-semibold">A receber e glosas por convênio</h2>
      <div className="grid gap-3 sm:grid-cols-2"><Kpi label="A receber (lotes enviados)" value={money(toReceive)} tone="info" /><Kpi label="Glosado até agora" value={money(gloss)} tone="warning" /></div>
      <ul className="space-y-2">
        {rows.map(({ ins, t, reasons }) => (
          <li key={ins.id} className="rounded-md border border-border bg-surface-200 p-3 text-sm">
            <p className="font-semibold">{ins.name}</p>
            <p className="text-ink-muted">Faturado {money(t.billed)} · Pago {money(t.paid)} · A receber {money(t.open)} · Glosa {money(t.gloss)}</p>
            {reasons.length > 0 && <p className="mt-1 text-ink-muted">Motivos de glosa: {reasons.slice(0, 4).map(([r, c]) => `${r} (${money(c)})`).join("; ")}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BatchDetail({ db, batch, run, onClose }: { db: Db; batch: BillingBatch; run: ReturnType<typeof useAction>; onClose: () => void }) {
  const ins = db.insurers.find((i) => i.id === batch.insurerId);
  const items = db.billingItems.filter((i) => i.batchId === batch.id);
  const t = batchTotals(items);
  const [protocol, setProtocol] = useState(batch.protocol ?? "");
  const [sentOn, setSentOn] = useState(batch.sentOn ?? todayISO());
  const pendingCash = t.paid - batch.cashedCents;

  const download = () => {
    const url = URL.createObjectURL(new Blob([batchCsv(db, batch)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `faturamento-${(ins?.name ?? "convenio").toLowerCase().replace(/\W+/g, "-")}-${batch.year}-${String(batch.month).padStart(2, "0")}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };
  const toCash = () => run(async () => {
    if (!api.cash) throw new Error("O Caixa não está disponível.");
    await api.cash.addMovement({ kind: "in", date: todayISO(), amountCents: pendingCash, method: "insurance", category: "Convênio",
      description: `${ins?.name ?? "Convênio"} — lote ${String(batch.month).padStart(2, "0")}/${batch.year}${batch.protocol ? ` (protocolo ${batch.protocol})` : ""}` });
    await api.insurance.setCashed(batch.id, t.paid);
  }, "Entrada lançada no caixa.");
  const payAll = () => run(async () => {
    for (const i of items) if (i.status === "pending") await api.insurance.updateItem(i.id, { paidCents: i.billedCents, glossCents: 0 });
  }, "Tudo marcado como pago.");

  return (
    <div className="mt-2 space-y-4 rounded-md border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi label="Faturado" value={money(t.billed)} /><Kpi label="Pago" value={money(t.paid)} tone="success" />
        <Kpi label="Glosa" value={money(t.gloss)} tone="warning" /><Kpi label="Em aberto" value={money(t.open)} tone="info" />
      </div>

      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Número do protocolo">{(id) => <Input id={id} value={protocol} maxLength={60} onChange={(e) => setProtocol(e.target.value)} />}</Field>
        <Field label="Data de envio">{(id) => <Input id={id} type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} />}</Field>
        <Button onClick={() => run(() => api.insurance.submitBatch(batch.id, protocol, sentOn), batch.sentOn ? "Envio atualizado." : "Lote marcado como enviado.")}><Send aria-hidden className="size-4" />{batch.sentOn ? "Atualizar envio" : "Marcar como enviado"}</Button>
      </div>
      {batch.expectedOn && <p className="text-sm text-ink-muted">Previsão de pagamento: {dateBR(batch.expectedOn)}.</p>}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={download}><Download aria-hidden className="size-4" />Exportar CSV</Button>
        {batch.sentOn && items.some((i) => i.status === "pending") && <Button variant="secondary" onClick={payAll}>Marcar tudo como pago</Button>}
        <Button variant="secondary" disabled={pendingCash <= 0} onClick={toCash}><Wallet aria-hidden className="size-4" />Lançar {money(Math.max(0, pendingCash))} no caixa</Button>
        <Button variant="ghost" onClick={() => { if (confirm("Excluir este lote? Os atendimentos voltam a poder ser faturados.")) run(async () => { await api.insurance.removeBatch(batch.id); onClose(); }, "Lote excluído."); }}><Trash2 aria-hidden className="size-4" />Excluir lote</Button>
      </div>
      {!batch.sentOn && <p className="text-sm text-ink-muted">Marque o lote como enviado para registrar pagamentos e glosas.</p>}

      <ul className="space-y-2">{items.map((i) => <ItemRow key={`${i.id}:${i.paidCents}:${i.glossCents}`} db={db} item={i} canEdit={!!batch.sentOn} run={run} />)}</ul>
    </div>
  );
}

function ItemRow({ db, item, canEdit, run }: { db: Db; item: BillingItem; canEdit: boolean; run: ReturnType<typeof useAction> }) {
  const [paid, setPaid] = useState(reais(item.paidCents));
  const [gloss, setGloss] = useState(reais(item.glossCents));
  const [reason, setReason] = useState(item.glossReason ?? "");
  const name = db.patients.find((p) => p.id === item.patientId)?.fullName ?? "Paciente";
  const save = () => run(() => api.insurance.updateItem(item.id, { paidCents: parseMoney(paid) ?? 0, glossCents: parseMoney(gloss) ?? 0, glossReason: reason }), "Item atualizado.");
  return (
    <li className="space-y-2 rounded-md bg-surface-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-40 flex-1 font-semibold">{name} — {item.procedureName}</span>
        <Badge tone={item.status === "paid" ? "success" : item.status === "glossed" ? "danger" : item.status === "partial" ? "warning" : "neutral"}>{ITEM_STATUS_LABEL[item.status]}</Badge>
      </div>
      <p className="text-ink-muted">{dateBR(item.performedAt)}{item.cardNumber ? ` · Carteirinha ${item.cardNumber}` : ""} · Faturado {money(item.billedCents)}</p>
      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-end">
          <Field label="Pago (R$)">{(id) => <Input id={id} inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="0,00" />}</Field>
          <Field label="Glosa (R$)">{(id) => <Input id={id} inputMode="decimal" value={gloss} onChange={(e) => setGloss(e.target.value)} placeholder="0,00" />}</Field>
          <Field label="Motivo da glosa">{(id) => <Input id={id} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />}</Field>
          <Button size="sm" onClick={save}>Salvar</Button>
        </div>
      )}
    </li>
  );
}
