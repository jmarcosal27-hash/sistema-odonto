"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, MessageCircle } from "lucide-react";
import { useDb, api, PAYMENT_METHODS } from "@/lib/store";
import { monthSummary, lastMonths, overdue } from "@/lib/finance";
import { dateBR, money, parseMoney, todayISO, whatsappLink, plural } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/catalog";
import type { Installment, PaymentMethod } from "@/lib/types";
import { Badge, Button, Card, Empty, Field, Input, Kpi, Modal, PageSkeleton, Segmented, Select, Toggle } from "@/components/ui";
import { useAction } from "@/components/toast";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
type Tab = "overview" | "receivable" | "expenses";

export default function Page() {
  return <Suspense fallback={<PageSkeleton />}><Finance /></Suspense>;
}

function Finance() {
  const db = useDb();
  const run = useAction();
  const params = useSearchParams();
  const now = new Date();
  const [tab, setTab] = useState<Tab>((params.get("aba") as Tab) ?? "overview");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [span, setSpan] = useState<"6" | "12">("6");
  const [expFilter, setExpFilter] = useState<"all" | "toPay" | "paid">("all");
  const [recFilter, setRecFilter] = useState<"open" | "overdue" | "paid">("open");
  const [form, setForm] = useState(false);
  const [paying, setPaying] = useState<Installment | null>(null);
  if (!db) return <PageSkeleton />;
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const s = monthSummary(db, ym);
  const late = overdue(db);
  const series = lastMonths(ym, Number(span)).map((m) => ({ m, ...monthSummary(db, m) }));
  const max = Math.max(1, ...series.flatMap((x) => [x.received, x.spent]));
  const expensesAll = db.expenses.filter((e) => e.spentAt.startsWith(ym)).sort((a, b) => a.spentAt.localeCompare(b.spentAt));
  const expenses = expensesAll.filter((e) => expFilter === "all" || (expFilter === "paid" ? e.paid !== false : e.paid === false));
  const byCat = Object.entries(expensesAll.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amountCents; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const label = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(" de ", "/");
  const patient = (id: string) => db.patients.find((p) => p.id === id);

  const loosePending = db.treatments.filter((t) => t.paymentStatus === "pending");
  const inst = db.installments
    .filter((i) => (recFilter === "paid" ? !!i.paidAt : recFilter === "overdue" ? !i.paidAt && i.dueDate < todayISO() : !i.paidAt))
    .sort((a, b) => (recFilter === "paid" ? (b.paidAt ?? "").localeCompare(a.paidAt ?? "") : a.dueDate.localeCompare(b.dueDate)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[
          { value: "overview", label: "Visão do mês" },
          { value: "receivable", label: <>A receber{late.length ? <span className="ml-1.5 rounded-pill bg-danger px-1.5 text-[11px] text-on-brand">{late.length}</span> : null}</> },
          { value: "expenses", label: "Despesas" },
        ]} />
        <div className="flex-1" />
        {tab !== "receivable" && <>
          <Select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y}>{y}</option>)}</Select>
          <Select aria-label="Mês" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-40">{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</Select>
        </>}
      </div>

      {tab === "overview" && <>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Sobrou no mês" value={money(s.balance)} sub="recebido menos despesas" valueClass={s.balance < 0 ? "text-danger" : "text-success"} />
          <Kpi label="Recebido" value={money(s.received)} valueClass="text-success" sub="avulsos + parcelas pagas" />
          <Kpi label="Despesas lançadas" value={money(s.spent)} sub={s.toPay ? `${money(s.toPay)} ainda a pagar` : "tudo pago"} />
          <Kpi tone="warning" label="A receber" value={money(s.receivable)} sub={late.length ? plural(late.length, "parcela vencida", "parcelas vencidas") : "nada vencido"} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div><h2 className="font-semibold">Entradas e saídas</h2><p className="text-xs text-ink-muted">Últimos {span} meses até {label(ym)}</p></div>
              <Segmented size="sm" label="Período" value={span} onChange={setSpan} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }]} />
            </div>
            {series.every((x) => !x.received && !x.spent) ? <Empty title="Sem movimento no período" /> : (
              <figure>
                <div className="flex h-48 items-end gap-2" role="img" aria-label={series.map((x) => `${label(x.m)}: recebido ${money(x.received)}, despesas ${money(x.spent)}`).join("; ")}>
                  {series.map((x) => (
                    <div key={x.m} className="flex flex-1 flex-col items-center gap-1 h-full justify-end">
                      <div className="flex w-full items-end justify-center gap-0.5 h-full">
                        <div className="w-1/3 rounded-t-sm bg-success" style={{ height: `${(x.received / max) * 100}%` }} title={`Recebido ${money(x.received)}`} />
                        <div className="w-1/3 rounded-t-sm bg-border-strong" style={{ height: `${(x.spent / max) * 100}%` }} title={`Despesas ${money(x.spent)}`} />
                      </div>
                      <span className={`text-[11px] ${x.m === ym ? "font-bold text-ink" : "text-ink-muted"}`}>{label(x.m)}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="mt-3 flex gap-4 text-xs text-ink-muted"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />Recebido</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-border-strong" />Despesas</span></figcaption>
              </figure>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold mb-3">Para onde foi o dinheiro</h2>
            {!byCat.length ? <p className="text-sm text-ink-muted">Nenhuma despesa neste mês.</p> : (
              <ul className="space-y-3">
                {byCat.map(([c, v]) => (
                  <li key={c}>
                    <div className="flex justify-between text-sm"><span>{c}</span><span className="tabular-nums font-semibold">{money(v)}</span></div>
                    <div className="mt-1 h-2 rounded-pill bg-surface-300"><div className="h-2 rounded-pill bg-ink-muted" style={{ width: `${(v / s.spent) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </>}

      {tab === "receivable" && <>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Kpi tone="warning" label="Total a receber" value={money(s.receivable)} />
          <Kpi label="Vencido" value={money(late.reduce((x, i) => x + i.amountCents, 0))} valueClass={late.length ? "text-danger" : ""} sub={plural(new Set(late.map((i) => i.patientId)).size, "paciente", "pacientes")} />
          <Kpi label="Atendimentos avulsos sem pagamento" value={money(loosePending.reduce((x, t) => x + t.priceCents, 0))} sub={<Link href="/atendimentos" className="font-semibold text-brand">ver em Atendimentos</Link>} />
        </div>
        <Segmented label="Parcelas" value={recFilter} onChange={setRecFilter} options={[{ value: "open", label: "Em aberto" }, { value: "overdue", label: `Vencidas · ${late.length}` }, { value: "paid", label: "Pagas" }]} />
        <Card className="p-0 overflow-hidden">
          {!inst.length ? <Empty title={recFilter === "paid" ? "Nenhuma parcela paga ainda" : "Nada a receber aqui"} body={recFilter === "open" ? "Ao aprovar um orçamento você define as parcelas; elas aparecem aqui até serem pagas." : undefined} /> : (
            <ul className="divide-y divide-border">
              {inst.map((i) => {
                const p = patient(i.patientId);
                const isLate = !i.paidAt && i.dueDate < todayISO();
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex-1 min-w-48">
                      <Link href={`/pacientes/${i.patientId}`} className="font-semibold hover:underline">{p?.fullName ?? "—"}</Link>
                      <p className="text-xs text-ink-muted">Parcela {i.number}/{i.of} · {i.paidAt ? `paga em ${dateBR(i.paidAt)}` : `vence ${dateBR(i.dueDate)}`}{i.method ? ` · ${PAYMENT_METHODS.find((m) => m.id === i.method)?.label}` : ""}</p>
                    </div>
                    <span className="font-bold tabular-nums">{money(i.amountCents)}</span>
                    {isLate && <Badge tone="danger">Vencida</Badge>}
                    {!i.paidAt ? <>
                      {isLate && p?.phone && <a href={whatsappLink(p.phone, `Olá, ${p.fullName.split(" ")[0]}! Passando para lembrar da parcela ${i.number}/${i.of} de ${money(i.amountCents)}, que venceu em ${dateBR(i.dueDate)}. Qualquer dúvida, é só chamar.`)} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success-soft px-3 text-xs font-semibold"><MessageCircle className="size-4" />Lembrar</a>}
                      <Button size="sm" onClick={() => setPaying(i)}>Receber</Button>
                    </> : <Button size="sm" variant="ghost" onClick={() => window.confirm("Desfazer o recebimento desta parcela?") && run(() => api.installments.unpay(i.id))}>Desfazer</Button>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </>}

      {tab === "expenses" && <>
        <div className="grid grid-cols-3 gap-3">
          <Kpi label="Total do mês" value={money(s.spent)} />
          <Kpi tone="success" label="Pago" value={money(s.paidOut)} />
          <Kpi tone="warning" label="A pagar" value={money(s.toPay)} />
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <Segmented size="sm" label="Filtro" value={expFilter} onChange={setExpFilter} options={[{ value: "all", label: "Todas" }, { value: "toPay", label: "A pagar" }, { value: "paid", label: "Pagas" }]} />
            <Button onClick={() => setForm(true)}><Plus className="size-4" />Nova despesa</Button>
          </div>
          {!expenses.length ? <Empty title="Nenhuma despesa aqui" body="Registre aluguel, material, laboratório… para saber quanto realmente sobra." /> : (
            <ul className="divide-y divide-border border-t border-border">
              {expenses.map((e) => {
                const paid = e.paid !== false;
                const isLate = !paid && e.spentAt < todayISO();
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-40"><p className="font-medium">{e.category}{e.recurring && <span className="ml-2 text-xs text-ink-muted">(fixa)</span>}</p><p className="text-xs text-ink-muted truncate">{e.description ? `${e.description} · ` : ""}{paid ? "" : "vence "}{dateBR(e.spentAt)}</p></div>
                    <span className="tabular-nums font-semibold">− {money(e.amountCents)}</span>
                    {paid ? <Badge tone="success">Paga</Badge> : isLate ? <Badge tone="danger">Atrasada</Badge> : <Badge tone="warning">A pagar</Badge>}
                    <Button size="sm" variant={paid ? "ghost" : "secondary"} onClick={() => run(() => api.expenses.setPaid(e.id, !paid))}>{paid ? "Marcar a pagar" : "Paguei"}</Button>
                    <button type="button" aria-label={`Apagar despesa ${e.category}`} onClick={() => window.confirm("Apagar esta despesa?") && run(() => api.expenses.remove(e.id), "Despesa apagada.")} className="rounded-pill p-2 text-ink-muted hover:text-danger"><Trash2 className="size-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </>}

      {form && <ExpenseForm onClose={() => setForm(false)} />}
      {paying && <PayInstallment installment={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

function PayInstallment({ installment, onClose }: { installment: Installment; onClose: () => void }) {
  const run = useAction();
  const [method, setMethod] = useState<PaymentMethod>(installment.method ?? "pix");
  const [date, setDate] = useState(todayISO());
  return (
    <Modal open onClose={onClose} title={`Receber parcela ${installment.number}/${installment.of}`} subtitle={money(installment.amountCents)}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={async () => { await run(() => api.installments.pay(installment.id, method, date), "Parcela recebida."); onClose(); }}>Confirmar recebimento</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Forma">{(id) => <Select id={id} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select>}</Field>
        <Field label="Data">{(id) => <Input id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0]);
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [recurring, setRecurring] = useState(false);
  const [paid, setPaid] = useState(true);
  const cents = parseMoney(value);
  return (
    <Modal open onClose={onClose} title="Nova despesa"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!cents} onClick={async () => { await run(() => api.expenses.create({ category: cat, description: desc || undefined, amountCents: cents!, spentAt: date, recurring, paid }), "Despesa lançada."); onClose(); }}>Lançar</Button></>}>
      <div className="space-y-4">
        <Field label="Categoria">{(id) => <Select id={id} value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Descrição (opcional)">{(id) => <Input id={id} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />}</Field>
          <Field label={paid ? "Data do pagamento" : "Vencimento"}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <Toggle checked={paid} onChange={setPaid} label="Já paguei" hint="Desligado, fica como conta a pagar até você marcar." />
        <Toggle checked={recurring} onChange={setRecurring} label="Despesa fixa" hint="Algo que se repete todo mês (aluguel, salário)." />
      </div>
    </Modal>
  );
}
