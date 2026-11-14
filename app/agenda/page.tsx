"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useDb } from "@/lib/store";
import { addDays, dateLong, fromISODate, toISODate, todayISO } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import { Button, Card, PageSkeleton, Segmented, cx } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { AppointmentForm } from "@/components/appointment-form";

const START = 7, END = 22, HOUR_PX = 56;
const PX_PER_MIN = HOUR_PX / 60;
const KIND = { consultation: "Consulta", return: "Retorno", personal: "Pessoal" };
const STYLE: Record<Appointment["status"], string> = {
  to_confirm: "bg-surface border-2 border-dashed border-accent",
  confirmed: "bg-surface-info-subtle border-l-4 border-accent",
  done: "bg-surface-success-subtle border-l-4 border-success",
  no_show: "bg-surface-warning-subtle border-l-4 border-danger",
  cancelled: "hidden",
};
const STATUS_TEXT: Record<Appointment["status"], string> = { to_confirm: "a confirmar", confirmed: "confirmado", done: "atendido", no_show: "faltou", cancelled: "cancelado" };
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export default function Page() {
  const db = useDb();
  const [day, setDay] = useState(todayISO());
  const [view, setView] = useState<"day" | "week">("week");
  const [hideWeekend, setHideWeekend] = useState(false);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [form, setForm] = useState<{ preset?: Partial<Appointment>; editing?: Appointment } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { if (window.innerWidth < 768) setView("day"); }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const ready = !!db;
  useEffect(() => { if (ready && scroller.current) scroller.current.scrollTop = (8 - START) * HOUR_PX; }, [ready]);

  const grid = useMemo(() => {
    const first = fromISODate(month + "-01");
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return toISODate(d); });
  }, [month]);

  if (!db) return <PageSkeleton />;
  const live = (d: string) => db.appointments.filter((a) => a.date === d && a.status !== "cancelled");
  const monday = addDays(day, -((fromISODate(day).getDay() + 6) % 7));
  const days = view === "day" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => !hideWeekend || ![0, 6].includes(fromISODate(d).getDay()));
  const name = (a: Appointment) => a.kind === "personal" ? a.title ?? "Compromisso pessoal" : db.patients.find((p) => p.id === a.patientId)?.fullName ?? "Paciente";
  const shiftMonth = (n: number) => { const d = fromISODate(month + "-01"); d.setMonth(d.getMonth() + n); setMonth(toISODate(d).slice(0, 7)); };
  const label = view === "day" ? dateLong(day) : `${fromISODate(days[0]).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${fromISODate(days[days.length - 1]).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
  const total = days.reduce((s, d) => s + live(d).length, 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: END - START }, (_, i) => START + i);

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="space-y-4 hidden xl:block">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold first-letter:uppercase">{fromISODate(month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <div className="flex gap-1">
                <button type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)} className="rounded-pill p-1.5 hover:bg-surface-sidebar"><ChevronLeft className="size-4" /></button>
                <button type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)} className="rounded-pill p-1.5 hover:bg-surface-sidebar"><ChevronRight className="size-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-muted mb-1" aria-hidden>{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d) => {
                const n = live(d).length;
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-label={`${dateLong(d)}${n ? `, ${n} compromisso(s)` : ""}`} aria-pressed={d === day}
                    className={cx("relative grid h-8 place-items-center rounded-full text-sm",
                      d.slice(0, 7) !== month && "text-muted/60",
                      d === day ? "bg-accent text-on-accent font-bold" : d === todayISO() ? "font-bold ring-1 ring-accent" : "hover:bg-surface-sidebar")}>
                    {Number(d.slice(8))}
                    {n > 0 && d !== day && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-accent" />}
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="space-y-2 text-xs">
            <p className="font-semibold text-sm">Legenda</p>
            <p className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border-2 border-dashed border-accent" />A confirmar</p>
            <p className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border-l-4 border-accent bg-surface-info-subtle" />Confirmado</p>
            <p className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border-l-4 border-success bg-surface-success-subtle" />Atendido</p>
            <p className="flex items-center gap-2"><span className="h-3 w-5 rounded-sm border-l-4 border-danger bg-surface-warning-subtle" />Faltou</p>
          </Card>
        </div>

        <Card className="min-w-0 p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Anterior" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))} className="rounded-pill p-2 hover:bg-surface-sidebar"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => setDay(todayISO())} className="rounded-pill border border-border-input h-8 px-3 text-xs font-semibold">Hoje</button>
              <button type="button" aria-label="Próximo" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))} className="rounded-pill p-2 hover:bg-surface-sidebar"><ChevronRight className="size-4" /></button>
            </div>
            <h2 className="text-sm font-semibold first-letter:uppercase flex-1 min-w-40">{label} <span className="font-normal text-muted">· {total} compromisso(s)</span></h2>
            {view === "week" && <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" className="size-4" checked={hideWeekend} onChange={(e) => setHideWeekend(e.target.checked)} />Ocultar fim de semana</label>}
            <Segmented size="sm" label="Visualização" value={view} onChange={setView} options={[{ value: "day", label: "Dia" }, { value: "week", label: "Semana" }]} />
            <Button size="sm" onClick={() => setForm({ preset: { date: day } })}><Plus className="size-4" />Nova consulta</Button>
          </div>

          <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))` }}>
            <div />
            {days.map((d) => {
              const untimed = live(d).filter((a) => !a.time);
              return (
                <div key={d} className="border-l border-border px-1 py-2 text-center">
                  <button type="button" onClick={() => { setDay(d); setView("day"); }} className={cx("text-xs font-semibold first-letter:uppercase", d === todayISO() && "text-accent")}>
                    {fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} <span className={cx("inline-grid size-6 place-items-center rounded-full", d === todayISO() && "bg-accent text-on-accent")}>{Number(d.slice(8))}</span>
                  </button>
                  {untimed.map((a) => (
                    <button key={a.id} type="button" onClick={() => setForm({ editing: a })} className="mt-1 block w-full truncate rounded-sm bg-surface-sidebar px-1 text-[11px]" title={`${name(a)} · horário a definir`}>
                      ⏱ {name(a)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          <div ref={scroller} className="relative max-h-[65vh] overflow-y-auto">
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0,1fr))`, height: (END - START) * HOUR_PX }}>
              <div className="relative">
                {hours.map((h) => <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted tabular-nums" style={{ top: (h - START) * HOUR_PX }}>{h > START ? `${h}:00` : ""}</span>)}
              </div>
              {days.map((d) => (
                <div key={d} className="relative border-l border-border" role="group" aria-label={dateLong(d)}>
                  {Array.from({ length: (END - START) * 4 }, (_, i) => {
                    const min = START * 60 + i * 15;
                    return (
                      <button key={i} type="button" aria-label={`Marcar ${dateLong(d)} às ${fmt(min)}`} tabIndex={i % 4 === 0 ? 0 : -1}
                        onClick={() => setForm({ preset: { date: d, time: fmt(min) } })}
                        className={cx("absolute inset-x-0 hover:bg-surface-info-subtle/60 focus:bg-surface-info-subtle", i % 4 === 0 && "border-t border-border")}
                        style={{ top: i * 15 * PX_PER_MIN, height: 15 * PX_PER_MIN }} />
                    );
                  })}
                  {d === todayISO() && nowMin >= START * 60 && nowMin <= END * 60 && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-danger" style={{ top: (nowMin - START * 60) * PX_PER_MIN }}>
                      <span className="absolute -left-1 -top-1.5 size-2.5 rounded-full bg-danger" />
                    </div>
                  )}
                  {live(d).filter((a) => a.time).map((a) => {
                    const top = Math.max(0, (toMin(a.time!) - START * 60) * PX_PER_MIN);
                    const height = Math.max(20, a.durationMinutes * PX_PER_MIN - 2);
                    return (
                      <button key={a.id} type="button" onClick={() => setForm({ editing: a })}
                        aria-label={`${a.time} ${name(a)}, ${KIND[a.kind]}, ${a.durationMinutes} minutos, ${STATUS_TEXT[a.status]}`}
                        className={cx("absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-sm px-1.5 py-0.5 text-left shadow-card hover:ring-1 hover:ring-accent", STYLE[a.status], a.kind === "personal" && "!bg-surface-sidebar !border-muted")}
                        style={{ top, height }}>
                        <span className="block truncate text-[11px] font-semibold">{a.time} {name(a)}</span>
                        {height > 34 && <span className="block truncate text-[10px] text-muted">{KIND[a.kind]} · {a.durationMinutes} min</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      {form && <AppointmentForm open onClose={() => setForm(null)} preset={form.preset} editing={form.editing} />}
    </div>
  );
}
