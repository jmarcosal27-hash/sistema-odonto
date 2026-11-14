"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useDb, recallInfo, activePatients, stalledTreatments } from "@/lib/store";
import { monthSummary, overdue } from "@/lib/finance";
import { addDays, dateLong, dateShort, fromISODate, money, todayISO } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import { Card, PageSkeleton, cx } from "@/components/ui";

const DAY_START = 7 * 60, DAY_END = 20 * 60;
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

function DayTimeline({ list, name }: { list: Appointment[]; name: (a: Appointment) => string }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const pos = (m: number) => `${((Math.min(Math.max(m, DAY_START), DAY_END) - DAY_START) / (DAY_END - DAY_START)) * 100}%`;
  const timed = list.filter((a) => a.time);
  return (
    <div>
      <div className="relative h-10 rounded-md bg-surface-200/60" role="list" aria-label="Consultas de hoje ao longo do dia">
        {timed.map((a) => {
          const s = toMin(a.time!), e = s + a.durationMinutes;
          const past = e <= nowMin;
          return (
            <Link key={a.id} role="listitem" href="/agenda" title={`${a.time} · ${name(a)}`} aria-label={`${a.time} ${name(a)}`}
              className={cx("absolute top-1 bottom-1 rounded-sm",
                past ? "bg-ink/20" : a.status === "to_confirm" ? "border-2 border-dashed border-brand bg-surface-200" : "bg-brand")}
              style={{ left: pos(s), width: `max(6px, calc(${pos(e)} - ${pos(s)}))` }} />
          );
        })}
        {nowMin >= DAY_START && nowMin <= DAY_END && <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 bg-danger" style={{ left: pos(nowMin) }} />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted tabular-nums" aria-hidden>{["7h", "10h", "13h", "16h", "20h"].map((h) => <span key={h}>{h}</span>)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-ink/20" />já passou</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border-2 border-dashed border-brand" />falta confirmar</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand" />confirmada</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 bg-danger" />agora</li>
      </ul>
    </div>
  );
}

export default function Home() {
  const db = useDb();
  if (!db) return <PageSkeleton />;
  const today = todayISO();
  const weekStart = addDays(today, -((fromISODate(today).getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const live = db.appointments.filter((a) => a.status !== "cancelled");
  const todays = live.filter((a) => a.date === today).sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  const nowHM = new Date().toTimeString().slice(0, 5);
  const next = live.filter((a) => a.patientId && (a.date > today || (a.date === today && (a.time ?? "99") >= nowHM))).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")))[0];
  const nextPatient = next && db.patients.find((p) => p.id === next.patientId);
  const name = (a: Appointment) => a.kind === "personal" ? a.title ?? "Pessoal" : db.patients.find((p) => p.id === a.patientId)?.fullName ?? "Paciente";
  const s = monthSummary(db, today.slice(0, 7));
  const openBudgets = db.budgets.filter((b) => b.status === "presented");
  const recall = activePatients(db).filter((p) => recallInfo(db, p)?.status === "pending");
  const late = overdue(db);
  const waiting = db.waitlist.filter((w) => w.status === "waiting" || w.status === "contacted");
  const stalled = stalledTreatments(db);
  const toConfirm = live.filter((a) => a.patientId && a.status === "to_confirm" && a.date >= today && a.date <= addDays(today, 2)).length;
  const first = db.profile.professionalName?.split(" ").slice(-1)[0];

  const todo = [
    { n: late.length ? new Set(late.map((i) => i.patientId)).size : 0, text: "paciente(s) com parcela vencida", link: "Ver cobranças", href: "/financeiro?aba=receivable" },
    { n: toConfirm, text: "consulta(s) nos próximos 2 dias sem confirmação", link: "Confirmar", href: "/agenda/confirmar" },
    { n: recall.length, text: "retorno(s) para chamar", link: "Ver retornos", href: "/agenda/retornos" },
    { n: stalled.length, text: "tratamento(s) aprovado(s) e parado(s)", link: "Ver parados", href: "/atendimentos/parados" },
    { n: waiting.length, text: "pessoa(s) na lista de espera", link: "Ver lista", href: "/agenda/espera" },
    { n: openBudgets.length, text: "orçamento(s) esperando resposta", link: "Ver orçamentos", href: "/orcamentos" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Olá{first ? `, ${first}` : ""}!</h2>
        <p className="text-sm text-ink-muted first-letter:uppercase">{dateLong(today)}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-lg bg-brand-soft p-5 space-y-4" aria-labelledby="hoje">
          <div className="flex items-baseline justify-between">
            <h3 id="hoje" className="font-semibold"><span className="text-[22px]">{todays.length}</span> consulta(s) hoje</h3>
            <Link href="/agenda" className="text-sm font-semibold">Abrir agenda</Link>
          </div>
          <DayTimeline list={todays} name={name} />
          {nextPatient ? (
            <Link href={`/pacientes/${nextPatient.id}`} className="block rounded-md hover:bg-surface-200/40 -mx-2 px-2 py-1">
              <p className="text-xs text-ink-muted">Próximo paciente</p>
              <p className="text-lg font-bold break-words">{nextPatient.fullName}</p>
              <p className="text-sm text-ink-muted">{next!.date === today ? "Hoje" : dateShort(next!.date)} · {next!.time ?? "horário a definir"} · {next!.durationMinutes} min</p>
            </Link>
          ) : <p className="text-sm text-ink-muted">Nenhum paciente marcado daqui pra frente.</p>}
          <ol className="grid grid-cols-7 gap-1 border-t border-ink/10 pt-3">
            {week.map((d) => {
              const n = live.filter((a) => a.date === d).length;
              return (
                <li key={d}>
                  <Link href="/agenda" aria-label={`${dateLong(d)}: ${n ? `${n} compromisso(s)` : "livre"}`}
                    className={cx("flex flex-col items-center rounded-md py-2 text-xs", d === today ? "bg-ink text-surface-100" : "hover:bg-surface-200/50")}>
                    <span className="capitalize">{fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                    <span className="text-base font-bold">{Number(d.slice(8))}</span>
                    <span>{n ? `${n} marc.` : "livre"}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link href="/agenda" className="inline-flex items-center gap-1 text-sm font-semibold"><Plus className="size-4" />Marcar horário</Link>
        </section>

        <div className="space-y-4">
          <Card>
            <h3 className="font-semibold mb-2">Para resolver</h3>
            <ul className="divide-y divide-border">
              {todo.map((t) => (
                <li key={t.href} className="flex items-center gap-3 py-2.5">
                  <span className={cx("w-7 text-lg font-bold tabular-nums", t.n ? "text-ink" : "text-ink-muted")}>{t.n}</span>
                  <span className="flex-1 text-sm">{t.text}</span>
                  {t.n > 0 && <Link href={t.href} className="inline-flex items-center gap-1 text-xs font-semibold text-brand whitespace-nowrap">{t.link}<ArrowRight className="size-3.5" /></Link>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <div className="flex items-baseline justify-between"><h3 className="font-semibold first-letter:uppercase">{fromISODate(today).toLocaleDateString("pt-BR", { month: "long" })} em números</h3><Link href="/indicadores" className="text-sm font-semibold text-brand">Indicadores</Link></div>
            <dl className="mt-3 grid grid-cols-2 gap-3">
              <div><dt className="text-xs text-ink-muted">Entrou</dt><dd className="text-lg font-bold text-success tabular-nums">{money(s.received)}</dd></div>
              <div><dt className="text-xs text-ink-muted">Saiu</dt><dd className="text-lg font-bold text-danger tabular-nums">{money(s.spent)}</dd></div>
              <div><dt className="text-xs text-ink-muted">Sobrou</dt><dd className={cx("text-lg font-bold tabular-nums", s.balance < 0 ? "text-danger" : "text-success")}>{money(s.balance)}</dd></div>
              <div><dt className="text-xs text-ink-muted">A receber</dt><dd className="text-lg font-bold tabular-nums">{money(s.receivable)}</dd></div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
