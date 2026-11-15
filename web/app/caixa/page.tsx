"use client";

import { Suspense, useMemo, useState } from "react";
import { Download, Plus, Undo2 } from "lucide-react";
import { useDb, api, isReadOnly, useRemoteState } from "@/lib/store";
import { CASH_METHODS, IN_CATEGORIES, OUT_CATEGORIES, cashCsv, cashLedger, cashTotals, commissionLines, expectedDrawer, methodLabel, signed, type CashEntry } from "@/lib/cash";
import { addDays, dateBR, money, parseMoney, todayISO } from "@/lib/format";
import { periodFor } from "@/lib/finance";
import type { CashMethod, Db } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, Input, Kpi, Modal, PageSkeleton, Segmented, Select, Textarea } from "@/components/ui";
import { useAction } from "@/components/toast";
import { useHotkeys } from "@/lib/hotkeys";

type Tab = "book" | "close" | "commission";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><Caixa /></Suspense>;
}

function Caixa() {
  const db = useDb();
  const remote = useRemoteState();
  const [tab, setTab] = useState<Tab>("book");
  if (!db) return <PageSkeleton />;
  const staff = !remote || remote.status !== "ready" || remote.session.role === "owner" || remote.session.role === "finance";
  const readOnly = isReadOnly(db);
  const active: Tab = staff ? tab : "commission";
  return (
    <div className="space-y-4">
      {staff && <Segmented label="Seção" value={active} onChange={setTab} options={[
        { value: "book", label: "Livro-caixa" }, { value: "close", label: "Fechamento do dia" }, { value: "commission", label: "Comissões" },
      ]} />}
      {readOnly && <p role="status" className="rounded-md bg-warning-soft p-3 text-sm">Acesso vencido: o caixa está só para consulta.</p>}
      {active === "book" && <Book db={db} readOnly={readOnly} />}
      {active === "close" && <Closing db={db} readOnly={readOnly} />}
      {active === "commission" && <Commission db={db} readOnly={readOnly || !staff} staff={staff} />}
    </div>
  );
}

const patientName = (db: Db, id?: string) => (id ? db.patients.find((p) => p.id === id)?.fullName : undefined);

/* ---------- Livro-caixa ---------- */

function Book({ db, readOnly }: { db: Db; readOnly: boolean }) {
  const run = useAction();
  const [m0, m1] = periodFor("month");
  const [from, setFrom] = useState(m0);
  const [to, setTo] = useState(m1);
  const [method, setMethod] = useState<"" | CashMethod>("");
  const [pro, setPro] = useState("");
  const [kind, setKind] = useState<"all" | "in" | "out">("all");
  const [adding, setAdding] = useState<null | "in" | "out">(null);
  const [preset, setPreset] = useState<"today" | "month" | "last" | "custom">("month");
  const pickPreset = (p: typeof preset) => {
    setPreset(p);
    if (p === "today") { setFrom(todayISO()); setTo(todayISO()); }
    if (p === "month") { setFrom(m0); setTo(m1); }
    if (p === "last") { const [a, b] = periodFor("month", addDays(m0, -1)); setFrom(a); setTo(b); }
  };
  useHotkeys({ e: () => setAdding("in"), s: () => setAdding("out") }, !readOnly);
  const [reversing, setReversing] = useState<CashEntry | null>(null);

  const all = useMemo(() => cashLedger(db), [db]);
  const totals = cashTotals(all, from, to);
  const filtered = !!method || !!pro || kind !== "all";
  const inPeriod = all.filter((e) => e.date >= from && e.date <= to);
  // Saldo acumulado corre pelo caixa todo; por isso só aparece sem filtro.
  const balance = new Map<string, number>();
  inPeriod.reduce((acc, e) => { const v = acc + signed(e); balance.set(e.key, v); return v; }, totals.opening);
  const rows = inPeriod.filter((e) => (!method || e.method === method) && (!pro || e.professionalId === pro) && (kind === "all" || e.kind === kind));
  const sum = (k: "in" | "out") => rows.filter((e) => e.kind === k && !e.reversed).reduce((s, e) => s + e.amountCents, 0);
  const pros = db.professionals;

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([cashCsv(db, rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `caixa-${from}-a-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" label="Período rápido" value={preset} onChange={pickPreset}
          options={[{ value: "today", label: "Hoje" }, { value: "month", label: "Este mês" }, { value: "last", label: "Mês passado" }, { value: "custom", label: "Escolher datas" }]} />
        <Segmented size="sm" label="Tipo de lançamento" value={kind} onChange={setKind}
          options={[{ value: "all", label: "Tudo" }, { value: "in", label: "Entradas" }, { value: "out", label: "Saídas" }]} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        {preset === "custom" && <>
        <Field label="De">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => e.target.value && (setFrom(e.target.value), setPreset("custom"))} />}</Field>
        <Field label="Até">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => e.target.value && (setTo(e.target.value), setPreset("custom"))} />}</Field>
        </>}
        <Field label="Forma de pagamento">{(id) => <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as "" | CashMethod)}><option value="">Todas</option>{CASH_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
        <Field label="Dentista">{(id) => <Select id={id} value={pro} onChange={(e) => setPro(e.target.value)}><option value="">Todos</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}</Field>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Saldo inicial" value={money(totals.opening)} sub="caixa até o dia anterior" />
        <Kpi tone="success" label="Entradas" value={money(sum("in"))} valueClass="text-success" sub={filtered ? "com os filtros" : undefined} />
        <Kpi label="Saídas do caixa" value={money(sum("out"))} sub={filtered ? "com os filtros" : undefined} />
        <Kpi label="Saldo final" value={money(totals.closing)} valueClass={totals.closing < 0 ? "text-danger" : undefined} sub={totals.closing < 0 ? "negativo: confira se alguma saída foi lançada a mais" : "dinheiro que passou pelo caixa"} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={readOnly} title="Atalho: E" aria-keyshortcuts="E" onClick={() => setAdding("in")}><Plus aria-hidden className="size-4" />Entrada<kbd aria-hidden className="ml-1 hidden rounded-sm border border-current/30 px-1 text-[11px] font-medium leading-4 opacity-70 lg:inline">E</kbd></Button>
        <Button variant="secondary" disabled={readOnly} title="Atalho: S" aria-keyshortcuts="S" onClick={() => setAdding("out")}><Plus aria-hidden className="size-4" />Saída<kbd aria-hidden className="ml-1 hidden rounded-sm border border-current/30 px-1 text-[11px] font-medium leading-4 opacity-70 lg:inline">S</kbd></Button>
        <div className="flex-1" />
        <Button variant="secondary" disabled={!rows.length} onClick={exportCsv}><Download aria-hidden className="size-4" />Exportar CSV</Button>
      </div>

      <Card>
        {!rows.length ? <Empty title="Sem lançamentos neste período" body="Recebimentos de pacientes e despesas pagas aparecem aqui sozinhos." /> : (
          <ul className="divide-y divide-border">
            {rows.map((e) => {
              const name = patientName(db, e.patientId);
              const proName = pros.find((p) => p.id === e.professionalId)?.name;
              const canPro = (e.source === "installment" || e.source === "treatment") && !e.reversed && !readOnly;
              return (
                <li key={e.key} className="py-3 grid gap-x-3 gap-y-1 grid-cols-[1fr_auto] md:grid-cols-[88px_1fr_auto_auto]">
                  <p className="text-sm text-ink-muted md:order-1">{dateBR(e.date)}</p>
                  <div className="min-w-0 col-span-2 md:col-span-1 md:order-2">
                    <p className={e.reversed ? "font-medium line-through text-ink-muted" : "font-medium"}>{name ?? e.category}{e.procedure ? <span className="font-normal text-ink-muted"> · {e.procedure}</span> : null}</p>
                    <p className="text-xs text-ink-muted">{[name ? e.category : null, e.description, methodLabel(e.method), proName ? `Dentista: ${proName}` : null].filter(Boolean).join(" · ")}</p>
                    {e.reversed && <p className="text-xs text-danger">Estornado: {e.reversalReason}</p>}
                    {canPro && pros.length > 0 && (
                      <Select aria-label={`Dentista deste recebimento (${name ?? e.category})`} className="mt-1 !h-9 max-w-56 text-sm" value={e.professionalId ?? ""}
                        onChange={(ev) => run(() => api.cash.setReceipt(e.source as "installment" | "treatment", e.sourceId, { professionalId: ev.target.value || undefined }), "Dentista atualizado.")}>
                        <option value="">Sem dentista</option>{pros.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </Select>
                    )}
                  </div>
                  <div className="text-right md:order-3">
                    <p className={`font-semibold tabular-nums ${e.reversed ? "text-ink-muted line-through" : e.kind === "in" ? "text-success" : "text-ink"}`}>{e.kind === "in" ? "+" : "−"} {money(e.amountCents)}</p>
                    {!filtered && <p className="text-xs text-ink-muted tabular-nums">saldo após: {money(balance.get(e.key) ?? 0)}</p>}
                  </div>
                  <div className="md:order-4 flex items-start justify-end">
                    {e.reversed ? <Badge tone="danger">Estornado</Badge> : e.source !== "expense" && (
                      <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setReversing(e)} aria-label={`Estornar ${name ?? e.category}`}><Undo2 aria-hidden className="size-4" />Estornar</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {adding && <MovementDialog db={db} kind={adding} onClose={() => setAdding(null)} />}
      {reversing && <ReverseDialog entry={reversing} onClose={() => setReversing(null)} />}
    </>
  );
}

function MovementDialog({ db, kind, onClose }: { db: Db; kind: "in" | "out"; onClose: () => void }) {
  const run = useAction();
  const cats = kind === "in" ? IN_CATEGORIES : OUT_CATEGORIES;
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<CashMethod>("cash");
  const [category, setCategory] = useState(cats[0]);
  const [description, setDescription] = useState("");
  const [patientId, setPatientId] = useState("");
  const cents = parseMoney(amount);
  const error = amount && !cents ? "Informe um valor maior que zero." : undefined;
  return (
    <Modal open onClose={onClose} title={kind === "in" ? "Nova entrada" : "Nova saída"} subtitle="Lançamento manual. Recebimentos de pacientes e despesas já entram sozinhos."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!cents} onClick={async () => {
        const ok = await run(async () => { await api.cash.addMovement({ kind, date, amountCents: cents!, method, category, description: description || undefined, patientId: patientId || undefined }); return true; }, "Lançado no caixa.");
        if (ok) onClose();
      }}>Lançar</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Valor" error={error}>{(id, d) => <Input id={id} aria-describedby={d} inputMode="decimal" placeholder="0,00" value={amount} invalid={!!error} onChange={(e) => setAmount(e.target.value)} />}</Field>
        <Field label="Data">{(id) => <Input id={id} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label="Forma">{(id) => <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as CashMethod)}>{CASH_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
        <Field label="Categoria">{(id) => <Select id={id} value={category} onChange={(e) => setCategory(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Paciente (opcional)" className="sm:col-span-2">{(id) => <Select id={id} value={patientId} onChange={(e) => setPatientId(e.target.value)}><option value="">Nenhum</option>{db.patients.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select>}</Field>
        <Field label="Descrição (opcional)" className="sm:col-span-2">{(id) => <Input id={id} maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function ReverseDialog({ entry, onClose }: { entry: CashEntry; onClose: () => void }) {
  const run = useAction();
  const [reason, setReason] = useState("");
  const ok = reason.trim().length >= 3;
  return (
    <Modal open onClose={onClose} title="Estornar lançamento" subtitle={`${money(entry.amountCents)} · ${entry.category}. O lançamento fica no histórico, marcado como estornado.`}
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant="danger" disabled={!ok} onClick={async () => {
        const ok = await run(async () => { await api.cash.reverse(entry.source as "installment" | "treatment" | "movement", entry.sourceId, reason); return true; }, "Estornado.");
        if (ok) onClose();
      }}>Estornar</Button></>}>
      <Field label="Motivo do estorno" hint="Mínimo de 3 caracteres.">{(id, d) => <Textarea id={id} aria-describedby={d} rows={3} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      {entry.source === "installment" || entry.source === "treatment" ? <p className="mt-2 text-xs text-ink-muted">O estorno tira o valor do caixa e da comissão. Ele não reabre a parcela em Financeiro.</p> : null}
    </Modal>
  );
}

/* ---------- Fechamento do dia ---------- */

function Closing({ db, readOnly }: { db: Db; readOnly: boolean }) {
  const run = useAction();
  const [day, setDay] = useState(todayISO());
  const rec = db.cashDays.find((d) => d.day === day);
  const [opening, setOpening] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const all = useMemo(() => cashLedger(db), [db]);
  const openingCents = opening !== null ? parseMoney(opening) ?? 0 : rec?.openingCents ?? 0;
  const expected = expectedDrawer(all, day, openingCents);
  const dayRows = all.filter((e) => e.date === day && !e.reversed);
  const byMethod = CASH_METHODS.map((m) => ({ m, inn: dayRows.filter((e) => e.method === m.id && e.kind === "in").reduce((s, e) => s + e.amountCents, 0), out: dayRows.filter((e) => e.method === m.id && e.kind === "out").reduce((s, e) => s + e.amountCents, 0) })).filter((x) => x.inn || x.out);
  const countedCents = parseMoney(counted);
  const diff = rec?.closedAt ? (rec.countedCents ?? 0) - expected : countedCents !== undefined ? countedCents - expected : undefined;
  const closed = !!rec?.closedAt;
  const diffTone = diff === undefined ? "neutral" : diff === 0 ? "success" : "danger";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Dia">{(id) => <Input id={id} type="date" value={day} max={todayISO()} onChange={(e) => { if (e.target.value) { setDay(e.target.value); setOpening(null); setCounted(""); setNotes(""); } }} />}</Field>
        {closed ? <Badge tone="success">Caixa fechado</Badge> : <Badge tone="warning">Caixa aberto</Badge>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Abertura</h2>
          <p className="text-xs text-ink-muted mb-3">Dinheiro em espécie que estava na gaveta ao abrir.</p>
          <div className="flex items-end gap-2">
            <Field label="Valor de abertura" className="flex-1">{(id) => <Input id={id} inputMode="decimal" placeholder="0,00" disabled={closed || readOnly} value={opening ?? (rec ? (rec.openingCents / 100).toFixed(2).replace(".", ",") : "")} onChange={(e) => setOpening(e.target.value)} />}</Field>
            <Button variant="secondary" disabled={closed || readOnly || opening === null} onClick={() => run(() => api.cash.openDay(day, openingCents), "Caixa aberto.").then(() => setOpening(null))}>Abrir caixa</Button>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Movimento do dia por forma</h2>
          {!byMethod.length ? <p className="mt-2 text-sm text-ink-muted">Sem movimento neste dia.</p> : (
            <dl className="mt-2 space-y-1 text-sm">
              {byMethod.map(({ m, inn, out }) => <div key={m.id} className="flex justify-between gap-3"><dt>{m.label}</dt><dd className="tabular-nums"><span className="text-success">+ {money(inn)}</span> <span className="text-ink-muted">− {money(out)}</span></dd></div>)}
            </dl>
          )}
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold">Conferência</h2>
        <p className="text-xs text-ink-muted mb-3">Esperado em dinheiro = abertura + entradas em dinheiro − saídas em dinheiro. As outras formas não passam pela gaveta.</p>
        <div className="grid gap-3 sm:grid-cols-3 items-end">
          <Kpi label="Esperado em dinheiro" value={money(expected)} />
          <Field label="Valor contado">{(id) => <Input id={id} inputMode="decimal" placeholder="0,00" disabled={closed || readOnly} value={closed ? ((rec?.countedCents ?? 0) / 100).toFixed(2).replace(".", ",") : counted} onChange={(e) => setCounted(e.target.value)} />}</Field>
          <Kpi tone={diffTone === "danger" ? "warning" : diffTone === "success" ? "success" : "surface"} label="Diferença" value={diff === undefined ? "—" : `${diff > 0 ? "+" : ""}${money(diff)}`} valueClass={diff ? "text-danger" : undefined} sub={diff === undefined ? "informe o valor contado" : diff === 0 ? "conferido" : diff > 0 ? "sobra" : "falta"} />
        </div>
        {!closed && <Field label="Observações (opcional)" className="mt-3">{(id) => <Textarea id={id} rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>}
        {closed && rec?.notes && <p className="mt-3 text-sm">{rec.notes}</p>}
        {!closed && <div className="mt-3"><Button disabled={readOnly || countedCents === undefined} onClick={() => run(async () => { if (opening !== null) await api.cash.openDay(day, openingCents); await api.cash.closeDay(day, countedCents!, notes); }, "Caixa fechado.")}>Fechar caixa</Button></div>}
      </Card>
    </div>
  );
}

/* ---------- Comissões ---------- */

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
const toPct = (v: string) => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };

function Commission({ db, readOnly, staff }: { db: Db; readOnly: boolean; staff: boolean }) {
  const run = useAction();
  const [m0, m1] = periodFor("month");
  const [from, setFrom] = useState(m0);
  const [to, setTo] = useState(m1);
  const [paying, setPaying] = useState<string | null>(null);
  const lines = useMemo(() => commissionLines(db, from, to), [db, from, to]);
  const pros = db.professionals.filter((p) => staff ? p.active || db.commissionRules.some((r) => r.professionalId === p.id) : db.commissionRules.some((r) => r.professionalId === p.id));
  if (!db.professionals.length) return <Empty title="Cadastre os dentistas na Agenda" body="A comissão é por dentista. Cadastre em Agenda › Profissionais e volte aqui." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="De">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />}</Field>
        <Field label="Até">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />}</Field>
      </div>
      <p className="text-xs text-ink-muted">Base de cálculo: valor recebido, menos o percentual de custo (laboratório/material) configurado, vezes o percentual do dentista. Dentista do recebimento: o escolhido no Livro-caixa ou, se não houver, o da última consulta do paciente.</p>
      {!pros.length && <Empty title="Nenhuma regra visível para você" />}
      {pros.map((p) => {
        const mine = lines.filter((l) => l.professionalId === p.id);
        const pending = mine.filter((l) => !l.paid);
        const pendingSum = pending.reduce((s, l) => s + l.cents, 0);
        const paidSum = mine.filter((l) => l.paid).reduce((s, l) => s + l.cents, 0);
        const rules = db.commissionRules.filter((r) => r.professionalId === p.id);
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{p.name}</h2>
              <div className="flex items-center gap-2 text-sm"><Badge tone="warning">Pendente {money(pendingSum)}</Badge><Badge tone="success">Paga {money(paidSum)}</Badge></div>
            </div>
            {staff && <RuleEditor db={db} professionalId={p.id} readOnly={readOnly} />}
            {!staff && <p className="mt-2 text-sm text-ink-muted">{rules.map((r) => `${r.procedureKey || "Padrão"}: ${pct(r.percent)}`).join(" · ")}</p>}
            {!mine.length ? <p className="mt-3 text-sm text-ink-muted">Sem recebimentos com comissão neste período.</p> : (
              <ul className="mt-3 divide-y divide-border text-sm">
                {mine.map((l) => (
                  <li key={l.entry.key} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="min-w-0">{dateBR(l.entry.date)} · {patientName(db, l.entry.patientId) ?? "Paciente"}{l.entry.parts ? ` · ${l.entry.parts.map((p) => p.procedure).join(", ")}` : l.entry.procedure ? ` · ${l.entry.procedure}` : ""}</span>
                    {l.parts ? (
                      // Procedimentos com regras diferentes: parte de cada um (proporcional ao preço) × a regra dele.
                      <span className="tabular-nums text-ink-muted">
                        {l.parts.map((p) => `${p.procedure ?? "Outros"}: ${money(p.amountCents)} × ${pct(p.percent)}${p.labCostPercent ? ` (−${pct(p.labCostPercent)} custo)` : ""}`).join(" + ")} = <b className="text-ink">{money(l.cents)}</b> {l.paid ? <Badge tone="success">Paga</Badge> : <Badge tone="warning">Pendente</Badge>}
                      </span>
                    ) : (
                      <span className="tabular-nums text-ink-muted">{money(l.entry.amountCents)} × {pct(l.percent)}{l.labCostPercent ? ` (−${pct(l.labCostPercent)} custo)` : ""} = <b className="text-ink">{money(l.cents)}</b> {l.paid ? <Badge tone="success">Paga</Badge> : <Badge tone="warning">Pendente</Badge>}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {staff && <div className="mt-3"><Button disabled={readOnly || !pending.length} onClick={() => setPaying(p.id)}>Pagar comissão ({money(pendingSum)})</Button></div>}
            {paying === p.id && <PayDialog name={p.name} total={pendingSum} onClose={() => setPaying(null)} onPay={async (paidOn, method) => {
              const ok = await run(async () => { await api.cash.payCommission({ professionalId: p.id, periodFrom: from, periodTo: to, paidOn, method, items: pending.map((l) => ({ sourceType: l.entry.source as "installment" | "treatment", sourceId: l.entry.sourceId, amountCents: l.cents })) }); return true; }, "Comissão paga e lançada como saída no caixa.");
              if (ok) setPaying(null);
            }} />}
          </Card>
        );
      })}
    </div>
  );
}

function PayDialog({ name, total, onClose, onPay }: { name: string; total: number; onClose: () => void; onPay: (paidOn: string, method: CashMethod) => Promise<void> }) {
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<CashMethod>("pix");
  return (
    <Modal open onClose={onClose} title={`Pagar comissão de ${name}`} subtitle={`${money(total)} sai do caixa na data escolhida.`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => onPay(date, method)}>Confirmar pagamento</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data do pagamento">{(id) => <Input id={id} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}</Field>
        <Field label="Forma">{(id) => <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as CashMethod)}>{CASH_METHODS.filter((m) => m.id !== "insurance").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
      </div>
    </Modal>
  );
}

function RuleEditor({ db, professionalId, readOnly }: { db: Db; professionalId: string; readOnly: boolean }) {
  const run = useAction();
  const rules = db.commissionRules.filter((r) => r.professionalId === professionalId);
  const base = rules.find((r) => r.procedureKey === "");
  const [percent, setPercent] = useState(base ? String(base.percent) : "");
  const [lab, setLab] = useState(base ? String(base.labCostPercent) : "0");
  const [proc, setProc] = useState("");
  const [procPercent, setProcPercent] = useState("");
  const names = useMemo(() => [...new Set(db.treatments.map((t) => t.procedureName))].sort(), [db.treatments]);
  const bad = (v: string) => { const n = toPct(v); return !Number.isFinite(n) || n < 0 || n > 100; };
  const save = (key: string, p: string, l: string) => run(() => api.cash.saveRule({ professionalId, procedureKey: key, percent: toPct(p), labCostPercent: toPct(l) }), "Regra salva.");
  const listId = `procs-${professionalId}`;
  return (
    <div className="mt-3 space-y-3 rounded-md bg-surface-200/60 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="% de comissão (padrão)" error={percent && bad(percent) ? "De 0 a 100." : undefined}>{(id) => <Input id={id} type="number" inputMode="decimal" min={0} max={100} step={0.01} className="w-36" disabled={readOnly} value={percent} onChange={(e) => setPercent(e.target.value)} />}</Field>
        <Field label="% de custo a descontar" hint="Laboratório/material" error={lab && bad(lab) ? "De 0 a 100." : undefined}>{(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min={0} max={100} step={0.01} className="w-40" disabled={readOnly} value={lab} onChange={(e) => setLab(e.target.value)} />}</Field>
        <Button variant="secondary" disabled={readOnly || !percent || bad(percent) || bad(lab || "0")} onClick={() => save("", percent, lab || "0")}>Salvar padrão</Button>
      </div>
      {rules.filter((r) => r.procedureKey !== "").map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{r.procedureKey}</span><span>{pct(r.percent)}{r.labCostPercent ? ` (−${pct(r.labCostPercent)} custo)` : ""}</span>
          <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => run(() => api.cash.removeRule(r.id), "Regra removida.")} aria-label={`Remover regra de ${r.procedureKey}`}>Remover</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Exceção por procedimento">{(id) => <><Input id={id} list={listId} className="w-56" placeholder="Nome do procedimento" disabled={readOnly} value={proc} onChange={(e) => setProc(e.target.value)} /><datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist></>}</Field>
        <Field label="%" error={procPercent && bad(procPercent) ? "De 0 a 100." : undefined}>{(id) => <Input id={id} type="number" inputMode="decimal" min={0} max={100} step={0.01} className="w-28" disabled={readOnly} value={procPercent} onChange={(e) => setProcPercent(e.target.value)} />}</Field>
        <Button variant="secondary" disabled={readOnly || !proc.trim() || !procPercent || bad(procPercent)} onClick={async () => { await save(proc, procPercent, lab || "0"); setProc(""); setProcPercent(""); }}>Adicionar exceção</Button>
      </div>
    </div>
  );
}
