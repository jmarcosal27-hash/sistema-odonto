"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useDb } from "@/lib/store";
import { addDays, dateLong, fromISODate, toISODate, todayISO } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import { Button, Card, PageSkeleton, Segmented, Badge, cx } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { AppointmentForm } from "@/components/appointment-form";

const KIND = { consultation: { label: "Consulta", dot: "bg-accent" }, return: { label: "Retorno", dot: "bg-success" }, personal: { label: "Pessoal", dot: "bg-muted" } };
const STATUS: Record<Appointment["status"], [string, "neutral" | "success" | "info" | "danger" | "warning"]> = {
  to_confirm: ["A confirmar", "warning"], confirmed: ["Confirmado", "success"], done: ["Atendido", "info"], cancelled: ["Cancelado", "neutral"], no_show: ["Faltou", "danger"],
};
const SLOTS = ["08:00", "09:00", "10:00", "11:00", "14:00", "15:00", "16:00", "17:00"];

export default function Page() {
  const db = useDb();
  const [day, setDay] = useState(todayISO());
  const [view, setView] = useState<"day" | "week">("day");
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [form, setForm] = useState<{ preset?: Partial<Appointment>; editing?: Appointment } | null>(null);

  const grid = useMemo(() => {
    const first = fromISODate(month + "-01");
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return toISODate(d); });
  }, [month]);

  if (!db) return <PageSkeleton />;
  const on = (d: string) => db.appointments.filter((a) => a.date === d && a.status !== "cancelled").sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  const weekStart = addDays(day, -fromISODate(day).getDay());
  const days = view === "day" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const name = (a: Appointment) => a.kind === "personal" ? a.title ?? "Compromisso pessoal" : db.patients.find((p) => p.id === a.patientId)?.fullName ?? "Paciente";
  const shiftMonth = (n: number) => { const d = fromISODate(month + "-01"); d.setMonth(d.getMonth() + n); setMonth(toISODate(d).slice(0, 7)); };
  const monthLabel = fromISODate(month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const count = days.reduce((s, d) => s + on(d).length, 0);

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold first-letter:uppercase">{monthLabel}</h2>
              <div className="flex gap-1">
                <button type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)} className="rounded-pill p-1.5 hover:bg-surface-sidebar"><ChevronLeft className="size-4" /></button>
                <button type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)} className="rounded-pill p-1.5 hover:bg-surface-sidebar"><ChevronRight className="size-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-muted mb-1" aria-hidden>{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d) => {
                const has = on(d).length > 0;
                return (
                  <button key={d} type="button" onClick={() => { setDay(d); setView("day"); }} aria-label={`${dateLong(d)}${has ? `, ${on(d).length} compromisso(s)` : ""}`} aria-pressed={d === day}
                    className={cx("relative grid h-9 place-items-center rounded-full text-sm",
                      d.slice(0, 7) !== month && "text-muted/60",
                      d === day ? "bg-accent text-on-accent font-bold" : d === todayISO() ? "font-bold ring-1 ring-accent" : "hover:bg-surface-sidebar")}>
                    {Number(d.slice(8))}
                    {has && d !== day && <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-accent" />}
                  </button>
                );
              })}
            </div>
          </Card>
          <Card className="space-y-3">
            <p><span className="text-[22px] font-bold">{count}</span> <span className="text-sm text-muted">compromisso(s) {view === "day" ? "no dia" : "na semana"}</span></p>
            <ul className="flex gap-3 text-xs text-muted">{Object.values(KIND).map((k) => <li key={k.label} className="flex items-center gap-1.5"><span className={cx("size-2.5 rounded-full", k.dot)} />{k.label}</li>)}</ul>
            <Button className="w-full" onClick={() => setForm({ preset: { date: day } })}><Plus className="size-4" />Novo compromisso</Button>
          </Card>
        </div>

        <Card className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <Segmented label="Visualização" value={view} onChange={setView} options={[{ value: "day", label: "Dia" }, { value: "week", label: "Semana" }]} />
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Anterior" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))} className="rounded-pill p-2 hover:bg-surface-sidebar"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => setDay(todayISO())} className="text-sm font-semibold min-w-36 text-center first-letter:uppercase">{day === todayISO() ? "Hoje" : dateLong(day)}</button>
              <button type="button" aria-label="Próximo" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))} className="rounded-pill p-2 hover:bg-surface-sidebar"><ChevronRight className="size-4" /></button>
            </div>
          </div>
          <div className={cx("grid gap-3", view === "week" && "md:grid-cols-7")}>
            {days.map((d) => {
              const list = on(d);
              const taken = new Set(list.map((a) => a.time));
              return (
                <section key={d} aria-label={dateLong(d)} className={cx(view === "week" && "rounded-md bg-surface-sidebar/50 p-2 min-h-32")}>
                  {view === "week" && <h3 className={cx("text-xs font-semibold mb-2 first-letter:uppercase", d === todayISO() && "text-accent")}>{fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</h3>}
                  {!list.length && view === "day" && (
                    <div className="text-center py-6">
                      <p className="font-semibold">Dia livre</p>
                      <p className="text-sm text-muted mb-3">Escolha um horário para marcar.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {SLOTS.map((s) => <button key={s} type="button" onClick={() => setForm({ preset: { date: d, time: s } })} className="rounded-pill border border-dashed border-accent px-3 h-8 text-sm font-semibold text-accent hover:bg-surface-accent-subtle">{s}</button>)}
                      </div>
                    </div>
                  )}
                  <ul className="space-y-2">
                    {list.map((a) => (
                      <li key={a.id}>
                        <button type="button" onClick={() => setForm({ editing: a })} className="flex w-full items-start gap-3 rounded-md bg-surface p-2.5 text-left shadow-card hover:ring-1 hover:ring-accent">
                          <span aria-hidden className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", KIND[a.kind].dot)} />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold truncate">{name(a)}</span>
                            <span className="block text-xs text-muted">{a.time ?? "Horário a definir"} · {a.durationMinutes} min · {KIND[a.kind].label}</span>
                          </span>
                          {view === "day" && <Badge tone={STATUS[a.status][1]}>{STATUS[a.status][0]}</Badge>}
                        </button>
                      </li>
                    ))}
                  </ul>
                  {view === "day" && list.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="text-xs text-muted w-full">Horários livres</span>
                      {SLOTS.filter((s) => !taken.has(s)).map((s) => <button key={s} type="button" onClick={() => setForm({ preset: { date: d, time: s } })} className="rounded-pill border border-dashed border-accent px-3 h-7 text-xs font-semibold text-accent">{s}</button>)}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </Card>
      </div>
      {form && <AppointmentForm open onClose={() => setForm(null)} preset={form.preset} editing={form.editing} />}
    </div>
  );
}
