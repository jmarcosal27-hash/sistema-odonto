"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, UserPlus } from "lucide-react";
import { useDb, recallInfo, activePatients, stalledTreatments } from "@/lib/store";
import { monthSummary, overdue } from "@/lib/finance";
import { addDays, plural, dateLong, dateShort, fromISODate, money, todayISO, greetingName, notStarted } from "@/lib/format";
import type { Appointment, AppointmentStatus } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/agenda";
import { Badge, Card, PageSkeleton, SheetTitle, cx } from "@/components/ui";

const STATUS_TONE: Record<AppointmentStatus, "neutral" | "success" | "warning" | "danger" | "info" | "accent"> = {
  to_confirm: "warning", confirmed: "info", waiting: "accent", in_service: "accent", done: "success", no_show: "danger", cancelled: "neutral",
};

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
      <div className="relative h-10 rounded-md border border-border bg-surface-300/50" role="list" aria-label="Consultas de hoje ao longo do dia">
        {timed.map((a) => {
          const s = toMin(a.time!), e = s + a.durationMinutes;
          const past = e <= nowMin;
          return (
            <Link key={a.id} role="listitem" href="/agenda" title={`${a.time} · ${name(a)}`} aria-label={`${a.time} ${name(a)}`}
              className={cx("absolute top-1 bottom-1 rounded-sm",
                past ? "bg-ink/20" : a.status === "to_confirm" ? "border-[1.5px] border-dashed border-brand bg-surface-100" : "bg-brand")}
              style={{ left: pos(s), width: `max(6px, calc(${pos(e)} - ${pos(s)}))` }} />
          );
        })}
        {nowMin >= DAY_START && nowMin <= DAY_END && <span aria-hidden className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-brand" style={{ left: pos(nowMin) }} />}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-ink-muted tabular-nums" aria-hidden>{["7h", "10h", "13h", "16h", "20h"].map((h) => <span key={h}>{h}</span>)}</div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-ink/20" />já passou</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border-[1.5px] border-dashed border-brand" />falta confirmar</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-brand" />confirmada</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-0.5 rounded-full bg-brand" />agora</li>
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
  const toConfirm = live.filter((a) => a.patientId && a.status === "to_confirm" && notStarted(a) && a.date <= addDays(today, 2)).length;
  const first = greetingName(db.profile.professionalName);
  // Consultas de hoje que já passaram e continuam sem desfecho (atendido ou faltou).
  const unresolved = todays.filter((a) => a.patientId && !notStarted(a) && ["to_confirm", "confirmed", "waiting"].includes(a.status)).length;

  const todo = [
    { n: unresolved, text: ["consulta de hoje já passou sem registro", "consultas de hoje já passaram sem registro"], link: "Marcar na agenda", href: "/agenda" },
    { n: late.length ? new Set(late.map((i) => i.patientId)).size : 0, text: ["paciente com parcela vencida", "pacientes com parcela vencida"], link: "Ver cobranças", href: "/financeiro?aba=receivable" },
    { n: toConfirm, text: ["consulta nos próximos 2 dias sem confirmação", "consultas nos próximos 2 dias sem confirmação"], link: "Confirmar", href: "/agenda/confirmar" },
    { n: recall.length, text: ["retorno para chamar", "retornos para chamar"], link: "Ver retornos", href: "/agenda/retornos" },
    { n: stalled.length, text: ["tratamento aprovado e parado", "tratamentos aprovados e parados"], link: "Ver parados", href: "/atendimentos/parados" },
    { n: waiting.length, text: ["pessoa na lista de espera", "pessoas na lista de espera"], link: "Ver lista", href: "/agenda/espera" },
    { n: openBudgets.length, text: ["orçamento esperando resposta", "orçamentos esperando resposta"], link: "Ver orçamentos", href: "/orcamentos" },
  ];

  const profName = (id?: string) => db.professionals.find((p) => p.id === id)?.name;
  const dentists = new Set(todays.map((a) => a.professionalId).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xl font-bold tracking-[-0.01em]">Olá{first ? `, ${first}` : ""}!</h2>
        <div className="flex gap-2">
          <Link href="/pacientes?novo=1" className="inline-flex h-11 items-center gap-2 rounded-md border-[1.5px] border-border-strong bg-surface-100 px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-300"><UserPlus aria-hidden className="size-4" />Novo paciente</Link>
          <Link href="/agenda?nova=1" className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-on-brand transition-colors duration-150 hover:bg-brand-hover"><Plus aria-hidden className="size-4" />Marcar consulta</Link>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr] lg:items-start">
        <Card as="section" className="space-y-4 min-w-0">
          <SheetTitle id="hoje" aside={`${plural(todays.length, "consulta", "consultas")}${dentists > 1 ? ` · ${dentists} dentistas` : ""}`} action={<Link href="/agenda">Abrir agenda</Link>}>Agenda de hoje</SheetTitle>
          <DayTimeline list={todays} name={name} />
          {todays.length ? (
            <table className="w-full text-sm" aria-labelledby="hoje">
              <thead>
                <tr className="border-b border-border text-left text-xs text-ink-muted">
                  <th scope="col" className="pb-2 pr-3 font-semibold">Hora</th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">Paciente</th>
                  {db.professionals.length > 0 && <th scope="col" className="hidden pb-2 pr-3 font-semibold sm:table-cell">Dentista</th>}
                  <th scope="col" className="pb-2 text-right font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                {todays.map((a) => {
                  const now = a.status === "in_service" || a.status === "waiting";
                  return (
                    <tr key={a.id} className={cx("border-b border-border last:border-0", now && "bg-brand-soft")}>
                      <td className={cx("py-2.5 pr-3 font-semibold align-top", now && "pl-2 text-brand")}>{a.time ?? "—"}</td>
                      <td className="py-2.5 pr-3 align-top">
                        {a.patientId ? <Link href={`/pacientes/${a.patientId}`} className="font-semibold break-words hover:text-brand">{name(a)}</Link> : <span className="font-semibold">{name(a)}</span>}
                        {a.procedures?.length ? <span className="block text-xs text-ink-muted">{a.procedures.map((p) => p.name).join(" · ")}</span> : null}
                      </td>
                      {db.professionals.length > 0 && <td className="hidden py-2.5 pr-3 align-top text-ink-muted sm:table-cell">{profName(a.professionalId) ?? "Sem profissional"}</td>}
                      <td className="py-2.5 text-right align-top"><Badge tone={STATUS_TONE[a.status]}>{STATUS_LABEL[a.status]}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-ink-muted">
              Nenhuma consulta hoje.{" "}
              {nextPatient ? <>Próxima: <Link href={`/pacientes/${nextPatient.id}`} className="font-semibold text-ink hover:text-brand">{nextPatient.fullName}</Link>, {dateShort(next!.date)} · {next!.time ?? "horário a definir"}.</> : "Nenhum paciente marcado daqui pra frente."}
            </p>
          )}
          <ol className="grid grid-cols-7 gap-1 border-t border-border pt-3">
            {week.map((d) => {
              const n = live.filter((a) => a.date === d).length;
              const isToday = d === today;
              return (
                <li key={d}>
                  <Link href="/agenda" aria-label={`${dateLong(d)}: ${n ? plural(n, "compromisso", "compromissos") : "livre"}`} aria-current={isToday ? "date" : undefined}
                    className={cx("flex flex-col items-center rounded-md py-2 text-xs transition-colors duration-150", isToday ? "bg-ink text-paper" : "hover:bg-surface-300")}>
                    <span className="capitalize">{fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")}</span>
                    <span className="text-base font-bold">{Number(d.slice(8))}</span>
                    <span className={isToday ? "text-paper/75" : "text-ink-muted"}><span className="sm:hidden">{n || "–"}</span><span className="hidden sm:inline">{n ? `${n} marc.` : "livre"}</span></span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="space-y-4">
          <Card>
            <SheetTitle>Para resolver</SheetTitle>
            <ul className="mt-2 divide-y divide-border">
              {todo.map((t) => (
                <li key={t.href} className="flex items-center gap-3 py-2.5">
                  <span className={cx("w-7 text-lg font-bold tabular-nums", t.n ? "text-ink" : "text-ink-muted")}>{t.n}</span>
                  <span className="flex-1 text-sm">{t.text[t.n === 1 ? 0 : 1]}</span>
                  {t.n > 0 && <Link href={t.href} className="-mr-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-[13px] font-semibold text-brand whitespace-nowrap transition-colors duration-150 hover:bg-brand-soft">{t.link}<ArrowRight className="size-3.5" /></Link>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <SheetTitle action={<Link href="/indicadores">Indicadores</Link>}><span className="inline-block first-letter:uppercase">{fromISODate(today).toLocaleDateString("pt-BR", { month: "long" })} em números</span></SheetTitle>
            <dl className="mt-3 grid grid-cols-2 border-t border-border [&>div]:border-b [&>div]:border-border [&>div]:py-3 [&>div:nth-child(odd)]:border-r [&>div:nth-child(odd)]:pr-3 [&>div:nth-child(even)]:pl-3">
              <div><dt className="text-[13px] font-medium text-ink-muted">Recebido</dt><dd className="mt-0.5 text-[22px] leading-7 font-semibold tracking-[-0.02em] text-success tabular-nums">{money(s.received)}</dd></div>
              <div><dt className="text-[13px] font-medium text-ink-muted">Despesas lançadas</dt><dd className="mt-0.5 text-[22px] leading-7 font-semibold tabular-nums">{money(s.spent)}</dd></div>
              <div><dt className="text-[13px] font-medium text-ink-muted">Resultado do mês</dt><dd className={cx("mt-0.5 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums", s.balance < 0 ? "text-danger" : "text-success")}>{money(s.balance)}</dd></div>
              <div><dt className="text-[13px] font-medium text-ink-muted">A receber</dt><dd className="mt-0.5 text-[22px] leading-7 font-semibold tracking-[-0.02em] tabular-nums">{money(s.receivable)}</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-5 text-ink-muted">Resultado = recebido menos despesas lançadas no mês. O <Link href="/caixa" className="font-semibold text-brand">saldo do Caixa</Link> é outra conta: só o dinheiro que passou pela gaveta.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
