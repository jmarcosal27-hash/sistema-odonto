"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { useDb, recallInfo, activePatients } from "@/lib/store";
import { indicators, lastMonths, periodFor, billed, received } from "@/lib/finance";
import { addDays, money, todayISO } from "@/lib/format";
import { Card, Empty, PageSkeleton, Segmented } from "@/components/ui";

type Period = "month" | "30d" | "year";
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

function Metric({ label, value, hint, help, tone }: { label: string; value: string | number; hint?: string; help: string; tone?: "danger" | "success" }) {
  return (
    <div className="rounded-lg border border-border bg-surface-200 px-4 pb-4 pt-3.5 min-w-0">
      <p className="flex items-center justify-between gap-2 text-[13px] font-medium text-ink-muted">
        {label}<span title={help} aria-label={help} role="img"><CircleHelp className="size-3.5" /></span>
      </p>
      <p className={`mt-1 text-2xl font-semibold leading-8 tracking-[-0.02em] truncate ${tone === "danger" ? "text-danger" : tone === "success" ? "text-success" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

export default function Page() {
  const db = useDb();
  const [period, setPeriod] = useState<Period>("month");
  if (!db) return <PageSkeleton />;
  const [from, to] = periodFor(period);
  const k = indicators(db, from, to);
  const months = lastMonths(todayISO().slice(0, 7), 6).map((m) => {
    const last = new Date(Number(m.slice(0, 4)), Number(m.slice(5)), 0).getDate();
    return { m, billed: billed(db, `${m}-01`, `${m}-${last}`), received: received(db, `${m}-01`, `${m}-${last}`) };
  });
  const max = Math.max(1, ...months.flatMap((x) => [x.billed, x.received]));
  const recallDue = activePatients(db).filter((p) => recallInfo(db, p)?.status === "pending").length;
  const sixMonths = addDays(todayISO(), -182);
  const away = activePatients(db).filter((p) => p.lastVisitAt && p.lastVisitAt.slice(0, 10) < sixMonths
    && !db.appointments.some((a) => a.patientId === p.id && a.date >= todayISO() && a.status !== "cancelled")).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">Como a clínica está indo, em números.</p>
        <Segmented label="Período" value={period} onChange={setPeriod} options={[{ value: "month", label: "Este mês" }, { value: "30d", label: "Últimos 30 dias" }, { value: "year", label: "Este ano" }]} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Faturado" value={money(k.billed)} help="Valor dos procedimentos concluídos no período, pagos ou não." />
        <Metric label="Recebido" value={money(k.received)} tone="success" help="Dinheiro que entrou: atendimentos avulsos pagos e parcelas recebidas." />
        <Metric label="Média por paciente" value={k.avgPerPayer === null ? "—" : money(k.avgPerPayer)} hint={k.avgPerPayer === null ? "sem pagamentos no período" : "entre quem pagou"} help="Recebido dividido pelo número de pacientes que pagaram algo no período." />
        <Metric label="Inadimplência" value={money(k.overdue)} tone={k.overdue ? "danger" : undefined} hint="parcelas vencidas hoje" help="Soma das parcelas com vencimento passado e ainda não pagas." />
        <Metric label="Taxa de falta" value={pct(k.noShowRate)} tone={k.noShowRate && k.noShowRate > 0.15 ? "danger" : undefined} hint={k.noShowRate === null ? "sem consultas no período" : "faltas ÷ consultas que aconteceriam"} help="Consultas marcadas como 'faltou' dividido por atendidas + faltas." />
        <Metric label="Conversão de orçamentos" value={pct(k.conversion)} hint={`${k.budgetsCount} apresentado(s)`} help="Aprovados ÷ orçamentos já respondidos (aprovados + recusados) apresentados no período." />
        <Metric label="Consultas realizadas" value={k.visits} help="Compromissos com paciente marcados como atendidos no período." />
        <Metric label="Novos pacientes" value={k.newPatients} help="Pacientes cadastrados no período." />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="font-semibold">Faturado × recebido</h2>
          <p className="text-xs text-ink-muted mb-4">Últimos 6 meses</p>
          {months.every((x) => !x.billed && !x.received) ? <Empty title="Sem movimento" /> : (
            <figure>
              <div className="flex h-44 items-end gap-3" role="img" aria-label={months.map((x) => `${x.m}: faturado ${money(x.billed)}, recebido ${money(x.received)}`).join("; ")}>
                {months.map((x) => (
                  <div key={x.m} className="flex flex-1 flex-col items-center gap-1 h-full justify-end">
                    <div className="flex w-full items-end justify-center gap-0.5 h-full">
                      <div className="w-1/3 rounded-t-sm bg-brand" style={{ height: `${(x.billed / max) * 100}%` }} title={`Faturado ${money(x.billed)}`} />
                      <div className="w-1/3 rounded-t-sm bg-success" style={{ height: `${(x.received / max) * 100}%` }} title={`Recebido ${money(x.received)}`} />
                    </div>
                    <span className="text-[11px] text-ink-muted">{new Date(Number(x.m.slice(0, 4)), Number(x.m.slice(5)) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>
                  </div>
                ))}
              </div>
              <figcaption className="mt-3 flex gap-4 text-xs text-ink-muted"><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand" />Faturado</span><span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-success" />Recebido</span></figcaption>
            </figure>
          )}
        </Card>
        <Card className="space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Retenção</h2><span className="rounded-pill bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">oportunidade</span></div>
          <p className="text-xs text-ink-muted">Pacientes que deveriam voltar e ainda não têm consulta.</p>
          <Link href="/agenda/retornos" className="block rounded-md bg-surface-300 p-3 hover:brightness-95"><span className="text-[22px] font-bold">{recallDue}</span> <span className="text-sm">retornos para chamar</span></Link>
          <Link href="/pacientes" className="block rounded-md bg-surface-300 p-3 hover:brightness-95"><span className="text-[22px] font-bold">{away}</span> <span className="text-sm">sem visita há 6+ meses</span></Link>
        </Card>
      </div>
    </div>
  );
}
