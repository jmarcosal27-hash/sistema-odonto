"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useDb, api } from "@/lib/store";
import { monthSummary, lastMonths } from "@/lib/finance";
import { dateBR, money, parseMoney, todayISO } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/catalog";
import { Button, Card, Empty, Field, Input, Kpi, Modal, PageSkeleton, Segmented, Select, Toggle } from "@/components/ui";
import { useAction } from "@/components/toast";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function Page() {
  const db = useDb();
  const run = useAction();
  const now = new Date();
  const [tab, setTab] = useState<"overview" | "expenses">("overview");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [span, setSpan] = useState<"6" | "12">("6");
  const [form, setForm] = useState(false);
  if (!db) return <PageSkeleton />;
  const ym = `${year}-${String(month + 1).padStart(2, "0")}`;
  const s = monthSummary(db, ym);
  const series = lastMonths(ym, Number(span)).map((m) => ({ m, ...monthSummary(db, m) }));
  const max = Math.max(1, ...series.flatMap((x) => [x.received, x.spent]));
  const expenses = db.expenses.filter((e) => e.spentAt.startsWith(ym)).sort((a, b) => b.spentAt.localeCompare(a.spentAt));
  const byCat = Object.entries(expenses.reduce<Record<string, number>>((acc, e) => { acc[e.category] = (acc[e.category] ?? 0) + e.amountCents; return acc; }, {})).sort((a, b) => b[1] - a[1]);
  const label = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(". de ", "/").replace(" de ", "/");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Seção" value={tab} onChange={setTab} options={[{ value: "overview", label: "Visão do mês" }, { value: "expenses", label: "Gastos" }]} />
        <div className="flex-1" />
        <Select aria-label="Ano" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-28">{[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y}>{y}</option>)}</Select>
        <Select aria-label="Mês" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-40">{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi tone={s.balance < 0 ? "warning" : "success"} label="Sobrou no mês" value={money(s.balance)} sub="recebido menos gastos" valueClass={s.balance < 0 ? "text-danger" : "text-success"} />
        <Kpi label="Recebido" value={money(s.received)} valueClass="text-success" />
        <Kpi label="Gastos" value={money(s.spent)} valueClass="text-danger" />
        <Kpi tone="warning" label="A receber" value={money(s.receivable)} sub="de todos os meses" />
      </div>

      {tab === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div><h2 className="font-semibold">Entradas e saídas</h2><p className="text-xs text-muted">Últimos {span} meses até {label(ym)}</p></div>
              <Segmented size="sm" label="Período" value={span} onChange={setSpan} options={[{ value: "6", label: "6 meses" }, { value: "12", label: "12 meses" }]} />
            </div>
            {series.every((x) => !x.received && !x.spent) ? <Empty title="Sem movimento no período" /> : (
              <figure>
                <div className="flex h-48 items-end gap-2" role="img" aria-label={series.map((x) => `${label(x.m)}: recebido ${money(x.received)}, gasto ${money(x.spent)}`).join("; ")}>
                  {series.map((x) => (
                    <div key={x.m} className="flex flex-1 flex-col items-center gap-1 h-full justify-end">
                      <div className="flex w-full items-end justify-center gap-0.5 h-full">
                        <div className="w-1/3 rounded-t-sm bg-success" style={{ height: `${(x.received / max) * 100}%` }} title={`Recebido ${money(x.received)}`} />
                        <div className="w-1/3 rounded-t-sm bg-danger" style={{ height: `${(x.spent / max) * 100}%` }} title={`Gasto ${money(x.spent)}`} />
                      </div>
                      <span className={`text-[11px] ${x.m === ym ? "font-bold text-text" : "text-muted"}`}>{label(x.m)}</span>
                    </div>
                  ))}
                </div>
                <figcaption className="mt-3 flex gap-4 text-xs text-muted"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />Recebido</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-danger" />Gasto</span></figcaption>
              </figure>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold mb-3">Para onde foi o dinheiro</h2>
            {!byCat.length ? <p className="text-sm text-muted">Nenhum gasto lançado neste mês.</p> : (
              <ul className="space-y-3">
                {byCat.map(([c, v]) => (
                  <li key={c}>
                    <div className="flex justify-between text-sm"><span>{c}</span><span className="tabular-nums font-semibold">{money(v)}</span></div>
                    <div className="mt-1 h-2 rounded-pill bg-surface-sidebar"><div className="h-2 rounded-pill bg-danger" style={{ width: `${(v / s.spent) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center justify-between p-4"><h2 className="font-semibold">Gastos de {MONTHS[month].toLowerCase()}</h2><Button onClick={() => setForm(true)}><Plus className="size-4" />Lançar gasto</Button></div>
          {!expenses.length ? <Empty title="Nenhum gasto neste mês" body="Registre aluguel, material, laboratório… para saber quanto realmente sobra." /> : (
            <ul className="divide-y divide-border border-t border-border">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0"><p className="font-medium">{e.category}{e.recurring && <span className="ml-2 text-xs text-muted">(todo mês)</span>}</p><p className="text-xs text-muted truncate">{e.description ? `${e.description} · ` : ""}{dateBR(e.spentAt)}</p></div>
                  <span className="tabular-nums font-semibold text-danger">{money(e.amountCents)}</span>
                  <button type="button" aria-label={`Apagar gasto ${e.category}`} onClick={() => window.confirm("Apagar este gasto?") && run(() => api.expenses.remove(e.id), "Gasto apagado.")} className="rounded-pill p-2 text-muted hover:text-danger"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {form && <ExpenseForm onClose={() => setForm(false)} />}
    </div>
  );
}

function ExpenseForm({ onClose }: { onClose: () => void }) {
  const run = useAction();
  const [cat, setCat] = useState(EXPENSE_CATEGORIES[0]);
  const [desc, setDesc] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayISO());
  const [recurring, setRecurring] = useState(false);
  const cents = parseMoney(value);
  return (
    <Modal open onClose={onClose} title="Lançar gasto"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!cents} onClick={async () => { await run(() => api.expenses.create({ category: cat, description: desc || undefined, amountCents: cents!, spentAt: date, recurring }), "Gasto lançado."); onClose(); }}>Lançar</Button></>}>
      <div className="space-y-4">
        <Field label="Categoria">{(id) => <Select id={id} value={cat} onChange={(e) => setCat(e.target.value)}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
        <Field label="Descrição (opcional)">{(id) => <Input id={id} value={desc} onChange={(e) => setDesc(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0,00" />}</Field>
          <Field label="Data">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        </div>
        <Toggle checked={recurring} onChange={setRecurring} label="Gasto fixo" hint="Marca como algo que se repete todo mês (aluguel, salário)." />
      </div>
    </Modal>
  );
}
