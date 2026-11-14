"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useDb, recallBucket } from "@/lib/store";
import { monthSummary } from "@/lib/finance";
import { addDays, dateLong, dateShort, fromISODate, money, todayISO } from "@/lib/format";
import { Card, PageSkeleton, cx } from "@/components/ui";

export default function Home() {
  const db = useDb();
  if (!db) return <PageSkeleton />;
  const today = todayISO();
  const weekStart = addDays(today, -((fromISODate(today).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const live = db.appointments.filter((a) => a.status !== "cancelled");
  const todays = live.filter((a) => a.date === today).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  const next = live.filter((a) => a.patientId && (a.date > today || (a.date === today && (a.time ?? "99") >= new Date().toTimeString().slice(0, 5)))).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))[0];
  const nextPatient = next && db.patients.find((p) => p.id === next.patientId);
  const s = monthSummary(db, today.slice(0, 7));
  const openBudgets = db.budgets.filter((b) => b.status === "presented");
  const recall = db.patients.filter((p) => recallBucket(p));
  const toConfirm = live.filter((a) => a.status === "to_confirm" && a.date >= today && a.date <= addDays(today, 2)).length;
  const due = db.treatments.filter((t) => t.paymentStatus === "pending");

  const alerts = [
    toConfirm && { text: `${toConfirm} consulta(s) nos próximos 2 dias sem confirmação`, href: "/agenda/confirmar" },
    openBudgets.length && { text: `${openBudgets.length} orçamento(s) esperando resposta`, href: "/orcamentos" },
    due.length && { text: `${money(due.reduce((x, t) => x + t.priceCents, 0))} a receber em ${due.length} atendimento(s)`, href: "/atendimentos" },
  ].filter(Boolean) as { text: string; href: string }[];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold first-letter:uppercase">{dateLong(today)}</h2>
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="rounded-lg bg-surface-info-subtle p-5" aria-labelledby="hoje">
          <div className="flex items-baseline justify-between">
            <h3 id="hoje" className="font-semibold">Hoje <span className="text-sm font-normal text-muted">{todays.length} compromisso(s)</span></h3>
            <Link href="/agenda" className="text-sm font-semibold">Ver agenda</Link>
          </div>
          {nextPatient ? (
            <Link href={`/pacientes/${nextPatient.id}`} className="mt-3 block rounded-md hover:bg-surface/40 -mx-2 px-2 py-1">
              <p className="text-xs text-muted">Próximo paciente</p>
              <p className="text-[22px] font-bold leading-7 break-words">{nextPatient.fullName}</p>
              <p className="text-sm text-muted">{next!.date === today ? "Hoje" : dateShort(next!.date)} · {next!.time ?? "horário a definir"} · {next!.durationMinutes} min</p>
            </Link>
          ) : <p className="mt-3 text-sm text-muted">Nenhum paciente marcado daqui pra frente.</p>}
          <ol className="mt-4 grid grid-cols-7 gap-1 border-t border-text/10 pt-3">
            {week.map((d) => {
              const n = live.filter((a) => a.date === d).length;
              return (
                <li key={d}>
                  <Link href="/agenda" aria-label={`${dateLong(d)}: ${n ? `${n} compromisso(s)` : "livre"}`}
                    className={cx("flex flex-col items-center rounded-md py-2 text-xs", d === today ? "bg-text text-surface" : "hover:bg-surface/50")}>
                    <span className="capitalize">{fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                    <span className="text-base font-bold">{Number(d.slice(8))}</span>
                    <span>{n ? `${n} marc.` : "livre"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link href="/agenda" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"><Plus className="size-4" />Marcar horário</Link>
        </section>

        <div className="space-y-4">
          <section className={cx("rounded-lg p-5", alerts.length ? "bg-surface-warning-subtle" : "bg-surface-success-subtle")} aria-labelledby="pend">
            <h3 id="pend" className="font-semibold">{alerts.length ? "Pendências" : "Tudo em dia"}</h3>
            {!alerts.length ? <p className="text-sm text-muted mt-1">Quando houver orçamento parado, pagamento atrasado ou consulta sem confirmação, aparece aqui.</p> : (
              <ul className="mt-2 space-y-1">{alerts.map((a) => <li key={a.href}><Link href={a.href} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 text-sm hover:bg-surface/50">{a.text}<ArrowRight className="size-4 shrink-0" /></Link></li>)}</ul>
            )}
          </section>
          <Card>
            <div className="flex items-baseline justify-between"><h3 className="font-semibold first-letter:uppercase">{fromISODate(today).toLocaleDateString("pt-BR", { month: "long" })} em números</h3><Link href="/financeiro" className="text-sm font-semibold text-accent">Financeiro</Link></div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-muted">Entrou</dt><dd className="text-lg font-bold text-success tabular-nums">{money(s.received)}</dd></div>
              <div><dt className="text-xs text-muted">Saiu</dt><dd className="text-lg font-bold text-danger tabular-nums">{money(s.spent)}</dd></div>
              <div><dt className="text-xs text-muted">Sobrou</dt><dd className={cx("text-lg font-bold tabular-nums", s.balance < 0 ? "text-danger" : "text-success")}>{money(s.balance)}</dd></div>
              <div><dt className="text-xs text-muted">A receber</dt><dd className="text-lg font-bold tabular-nums">{money(s.receivable)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-lg bg-surface-warning-subtle p-5">
          <div className="flex items-baseline justify-between"><h3 className="font-semibold">Orçamentos em aberto</h3><Link href="/orcamentos" className="text-sm font-semibold">Ver todos</Link></div>
          {!openBudgets.length ? <p className="text-sm text-muted mt-2">Nenhum esperando resposta.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{openBudgets.slice(0, 4).map((b) => <li key={b.id} className="flex justify-between gap-2"><span className="truncate">{db.patients.find((p) => p.id === b.patientId)?.fullName}</span><span className="font-semibold tabular-nums">{money(b.totalCents)}</span></li>)}</ul>
          )}
        </section>
        <section className="rounded-lg bg-surface-accent-subtle p-5">
          <div className="flex items-baseline justify-between"><h3 className="font-semibold">Para reativar</h3><Link href="/agenda/reativar" className="text-sm font-semibold">Ver lista</Link></div>
          {!recall.length ? <p className="text-sm text-muted mt-2">Ninguém sumido há mais de 30 dias.</p> : (
            <ul className="mt-2 space-y-1 text-sm">{recall.slice(0, 4).map((p) => <li key={p.id} className="truncate">{p.fullName}</li>)}</ul>
          )}
        </section>
      </div>
    </div>
  );
}
