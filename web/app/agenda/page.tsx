"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Plus, Search, SlidersHorizontal, UserCog, Zap } from "lucide-react";
import { api, useDb, useRemoteState } from "@/lib/store";
import { addDays, dateBR, dateLong, fromISODate, toISODate, todayISO, plural } from "@/lib/format";
import type { Appointment, Professional, TimeBlock } from "@/lib/types";
import { NO_PROFESSIONAL, STATUS_LABEL, STATUS_ORDER, fmtMin, layoutLanes, matchesPatient, procedureTotals, toMin } from "@/lib/agenda";
import { Button, Card, Input, PageSkeleton, Segmented, Select, cx } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { AppointmentForm } from "@/components/appointment-form";
import { STATUS_CARD, StatusDot, StatusMenu } from "@/components/agenda-status";
import { ProfessionalsDialog } from "@/components/professionals-dialog";
import { BlockDetail, BlockDialog } from "@/components/block-dialog";
import { useAction } from "@/components/toast";
import { useHotkeys } from "@/lib/hotkeys";

const START = 7, END = 22;
const KIND = { consultation: "Consulta", return: "Retorno", personal: "Pessoal" };
const HATCH = "repeating-linear-gradient(135deg, transparent 0 6px, var(--border-strong) 6px 8px)";

/** Uma coluna da grade. "pro" mostra um profissional (ou "Sem profissional"); "all" mostra todos juntos. */
interface Col { key: string; name: string; color?: string; mode: "pro" | "all" }

export default function Page() {
  const db = useDb();
  const remote = useRemoteState();
  const run = useAction();
  const [day, setDay] = useState(todayISO());
  const [view, setView] = useState<"day" | "week">("week");
  const [zoom, setZoom] = useState<"30" | "60">("30");
  const [hideWeekend, setHideWeekend] = useState(false);
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [form, setForm] = useState<{ preset?: Partial<Appointment>; editing?: Appointment } | null>(null);
  const [blockForm, setBlockForm] = useState<{ date: string; time?: string; professionalId?: string } | null>(null);
  const [blockView, setBlockView] = useState<TimeBlock | null>(null);
  const [managing, setManaging] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [mobileProf, setMobileProf] = useState("all");
  const [now, setNow] = useState(() => new Date());
  const scroller = useRef<HTMLDivElement>(null);

  const hourPx = zoom === "30" ? 96 : 56;
  const ppm = hourPx / 60;
  const step = Number(zoom);
  const isOwner = !remote || (remote.status === "ready" && remote.session.role === "owner");

  useEffect(() => { if (window.innerWidth < 768) setView("day"); }, []);
  // Atalho vindo do Início ou da busca (Ctrl+K): /agenda?nova=1 abre a marcação direto.
  useEffect(() => { if (new URLSearchParams(window.location.search).get("nova") === "1") setForm({ preset: { date: todayISO() } }); }, []);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setMobile(mq.matches);
    on(); mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const ready = !!db;
  // Abre a grade perto da hora atual (uma hora antes); fora do expediente, às 8h.
  useEffect(() => {
    if (!ready || !scroller.current) return;
    const n = new Date(); const m = n.getHours() * 60 + n.getMinutes();
    const at = m >= START * 60 && m <= END * 60 ? Math.max(0, m / 60 - START - 1) : 8 - START;
    scroller.current.scrollTop = at * hourPx;
  }, [ready, hourPx]);
  useHotkeys({
    n: () => setForm({ preset: { date: day } }),
    t: () => setDay(todayISO()),
    arrowleft: () => setDay(addDays(day, view === "day" ? -1 : -7)),
    arrowright: () => setDay(addDays(day, view === "day" ? 1 : 7)),
  }, ready);

  const grid = useMemo(() => {
    const first = fromISODate(month + "-01");
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return toISODate(d); });
  }, [month]);

  const matches = useMemo(() => {
    if (!db || query.trim().length < 2) return [];
    return db.appointments.filter((a) => a.patientId && matchesPatient(db.patients.find((p) => p.id === a.patientId), query))
      .sort((x, y) => (y.date + (y.time ?? "")).localeCompare(x.date + (x.time ?? ""))).slice(0, 15);
  }, [db, query]);

  if (!db) return <PageSkeleton />;

  const proOf = (id?: string) => db.professionals.find((p) => p.id === id);
  const isHidden = (pid?: string) => hidden.has(pid ?? NO_PROFESSIONAL);
  const everyone = (d: string) => db.appointments.filter((a) => a.date === d && a.status !== "cancelled");
  const live = (d: string) => everyone(d).filter((a) => !isHidden(a.professionalId));
  const monday = addDays(day, -((fromISODate(day).getDay() + 6) % 7));
  const days = view === "day" ? [day] : Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => !hideWeekend || ![0, 6].includes(fromISODate(d).getDay()));
  const name = (a: Appointment) => a.kind === "personal" ? a.title ?? "Compromisso pessoal" : db.patients.find((p) => p.id === a.patientId)?.fullName ?? "Paciente";
  const shiftMonth = (n: number) => { const d = fromISODate(month + "-01"); d.setMonth(d.getMonth() + n); setMonth(toISODate(d).slice(0, 7)); };
  const label = view === "day" ? dateLong(day) : `${fromISODate(days[0]).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a ${fromISODate(days[days.length - 1]).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" })}`;
  const total = days.reduce((s, d) => s + live(d).length, 0);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const hours = Array.from({ length: END - START }, (_, i) => START + i);
  const hasPros = db.professionals.length > 0;

  // Colunas do dia: um profissional por coluna. Profissional inativo só aparece se tiver compromisso no dia.
  const dayColumns = (d: string): Col[] => {
    const appts = everyone(d);
    const cols: Col[] = db.professionals
      .filter((p) => !hidden.has(p.id) && (p.active || appts.some((a) => a.professionalId === p.id)))
      .map((p) => ({ key: p.id, name: p.name, color: p.color, mode: "pro" as const }));
    const loose = appts.some((a) => !a.professionalId);
    const activeCount = db.professionals.filter((p) => p.active).length;
    if (!hidden.has(NO_PROFESSIONAL) && (!activeCount || loose)) cols.push({ key: NO_PROFESSIONAL, name: hasPros ? "Sem profissional" : "Agenda", mode: "pro" });
    return cols;
  };
  const columns: { id: string; date: string; col: Col }[] = view === "week"
    ? days.map((d) => ({ id: d, date: d, col: { key: "all", name: "Todos", mode: "all" as const } }))
    : mobile
      ? [(() => {
        const only = mobileProf === "all" ? undefined : dayColumns(day).find((c) => c.key === mobileProf);
        return { id: `m-${mobileProf}`, date: day, col: only ?? { key: "all", name: "Todos os profissionais", mode: "all" as const } };
      })()]
      : dayColumns(day).map((c) => ({ id: c.key, date: day, col: c }));
  const dayEmpty = view === "day" && !mobile && columns.length === 0;

  const colAppts = (date: string, col: Col) => live(date).filter((a) => col.mode === "all" || (a.professionalId ?? NO_PROFESSIONAL) === col.key);
  const colBlocks = (date: string, col: Col) => db.timeBlocks.filter((b) => b.date === date && !isHidden(b.professionalId) && (col.mode === "all" || !b.professionalId || b.professionalId === col.key || (col.key === NO_PROFESSIONAL && !b.professionalId)));
  const presetPro = (col: Col) => (col.mode === "pro" && col.key !== NO_PROFESSIONAL ? col.key : undefined);
  const toggle = (id: string) => setHidden((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const minCol = view === "week" ? 100 : mobile ? 0 : 150;
  const setStatus = (a: Appointment, s: Appointment["status"]) => void run(() => api.appointments.setStatus(a.id, s), `${name(a)}: ${STATUS_LABEL[s].toLowerCase()}.`);
  const mobilePros: Col[] = [...db.professionals.filter((p) => !hidden.has(p.id)).map((p) => ({ key: p.id, name: p.name, color: p.color, mode: "pro" as const })),
    ...(hidden.has(NO_PROFESSIONAL) ? [] : [{ key: NO_PROFESSIONAL, name: hasPros ? "Sem profissional" : "Agenda", mode: "pro" as const }])];

  const apptCard = (a: Appointment & { lane: number; lanes: number }, col: Col) => {
    const who = name(a);
    const top = Math.max(0, (toMin(a.time!) - START * 60) * ppm);
    const height = Math.max(24, a.durationMinutes * ppm - 2);
    const pro = proOf(a.professionalId);
    const t = procedureTotals(a.procedures);
    const what = a.procedures?.length ? a.procedures[0].name + (a.procedures.length > 1 ? ` +${a.procedures.length - 1}` : "") : KIND[a.kind];
    const aria = `${a.time} ${who}, ${what}, ${a.durationMinutes} minutos, ${STATUS_LABEL[a.status].toLowerCase()}${pro ? `, ${pro.name}` : ""}${a.forced ? ", encaixe" : ""}${a.label ? `, etiqueta ${a.label}` : ""}`;
    return (
      <div key={a.id} className="absolute z-20" style={{ top, height, left: `calc(${(a.lane / a.lanes) * 100}% + 2px)`, width: `calc(${100 / a.lanes}% - 4px)` }}>
        <button type="button" onClick={() => setForm({ editing: a })} aria-label={aria} title={aria}
          className={cx("absolute inset-0 overflow-hidden rounded-md py-1 pl-2 text-left", view === "week" ? "pr-6" : "pr-8", " transition-shadow duration-150 hover:shadow-[var(--so-shadow-md)]", STATUS_CARD[a.status],
            a.kind === "personal" && "!bg-surface-300 !border-ink-muted", a.forced && "outline outline-2 outline-warning")}>
          <span className={cx("text-xs font-semibold leading-4 break-words", height > 60 ? "line-clamp-2" : "block truncate")}>
            {a.forced && <Zap aria-hidden className="mr-0.5 inline size-3 text-warning" />}{a.forced && <span className="sr-only">Encaixe. </span>}
            {who}
          </span>
          {height > 30 && <span className="block truncate text-[11px] leading-4 text-ink-muted"><span><span className="font-semibold text-ink">{a.time}</span>{view === "week" ? "" : <>{height <= 64 && ` · ${STATUS_LABEL[a.status]}`} · {what} · {a.durationMinutes} min{t.cents ? ` · R$ ${(t.cents / 100).toFixed(2).replace(".", ",")}` : ""}</>}</span></span>}
          {height > 64 && view !== "week" && <span className="flex items-center gap-1 truncate text-[11px] text-ink-muted"><StatusDot status={a.status} className="size-2" />{STATUS_LABEL[a.status]}{a.forced && " · Encaixe"}{a.label && ` · ${a.label}`}</span>}
          {col.mode === "all" && pro && <span aria-hidden className="absolute bottom-0.5 right-1 size-2.5 rounded-full" style={{ background: pro.color }} />}
        </button>
        <StatusMenu status={a.status} who={who} onPick={(s) => setStatus(a, s)} className={cx("absolute right-0 top-0 z-10 h-full max-h-[min(100%,2.75rem)] min-h-5", view === "week" ? "w-6" : "w-8")} />
      </div>
    );
  };

  const filterPanel = (
    <Card className={cx("space-y-4", showFilters ? "block" : "hidden", "xl:block")}>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Profissionais</h2>
          {isOwner && <button type="button" onClick={() => setManaging(true)} className="inline-flex h-10 items-center gap-1 rounded-md px-3 text-xs font-semibold text-brand hover:bg-brand-soft"><UserCog aria-hidden className="size-4" />Gerenciar</button>}
        </div>
        <ul>
          {db.professionals.map((p) => (
            <li key={p.id}><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!hidden.has(p.id)} onChange={() => toggle(p.id)} />
              <span aria-hidden className="size-3 rounded-full" style={{ background: p.color }} />{p.name}{!p.active && <span className="text-xs text-ink-muted">(inativo)</span>}</label></li>
          ))}
          <li><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={!hidden.has(NO_PROFESSIONAL)} onChange={() => toggle(NO_PROFESSIONAL)} />
            <span aria-hidden className="size-3 rounded-full border border-dashed border-ink-muted" />Sem profissional</label></li>
        </ul>
        {!hasPros && <p className="mt-1 text-xs text-ink-muted">{isOwner ? "Cadastre os dentistas em Gerenciar para ver uma coluna por profissional." : "O dono da clínica cadastra os profissionais."}</p>}
      </div>
      <div>
        <label htmlFor="busca-agenda" className="mb-1 flex items-center gap-1 text-sm font-semibold"><Search aria-hidden className="size-4" />Buscar agendamento</label>
        <Input id="busca-agenda" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome ou telefone" />
        {query.trim().length >= 2 && (
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto" aria-live="polite" aria-label="Resultados da busca">
            {matches.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => { setDay(a.date); setView("day"); setForm({ editing: a }); }} className="flex min-h-10 w-full flex-col rounded-sm px-2 py-1 text-left text-xs hover:bg-surface-300">
                  <span className="font-semibold">{dateBR(a.date)}{a.time ? ` · ${a.time}` : ""} · {name(a)}</span>
                  <span className="text-ink-muted">{STATUS_LABEL[a.status]}{proOf(a.professionalId) ? ` · ${proOf(a.professionalId)!.name}` : ""}</span>
                </button>
              </li>
            ))}
            {!matches.length && <li className="px-2 text-xs text-ink-muted">Nenhum agendamento encontrado.</li>}
          </ul>
        )}
      </div>
      <div className="space-y-1.5 text-xs">
        <p className="text-sm font-semibold">Legenda</p>
        {STATUS_ORDER.filter((s) => s !== "cancelled").map((s) => <p key={s} className="flex items-center gap-2"><span aria-hidden className={cx("h-3 w-5 rounded-sm", STATUS_CARD[s])} />{STATUS_LABEL[s]}</p>)}
        <p className="flex items-center gap-2"><span aria-hidden className="h-3 w-5 rounded-sm border border-border-strong" style={{ backgroundImage: HATCH }} />Horário bloqueado</p>
        <p className="flex items-center gap-2"><Zap aria-hidden className="size-3.5 text-warning" />Encaixe (marcado sobre outro horário)</p>
      </div>
    </Card>
  );

  return (
    <div className="space-y-4">
      <AgendaTabs />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <div className="space-y-4">
          <Card className="hidden xl:block">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold first-letter:uppercase">{fromISODate(month + "-01").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
              <div className="flex gap-1">
                <button type="button" aria-label="Mês anterior" onClick={() => shiftMonth(-1)} className="rounded-pill p-1.5 hover:bg-surface-300"><ChevronLeft className="size-4" /></button>
                <button type="button" aria-label="Próximo mês" onClick={() => shiftMonth(1)} className="rounded-pill p-1.5 hover:bg-surface-300"><ChevronRight className="size-4" /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-ink-muted mb-1" aria-hidden>{["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}</div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((d) => {
                const n = everyone(d).length;
                return (
                  <button key={d} type="button" onClick={() => setDay(d)} aria-label={`${dateLong(d)}${n ? `, ${plural(n, "compromisso", "compromissos")}` : ""}`} aria-pressed={d === day}
                    className={cx("relative grid h-8 place-items-center rounded-full text-sm",
                      d.slice(0, 7) !== month && "text-ink-muted/60",
                      d === day ? "bg-brand text-on-brand font-bold" : d === todayISO() ? "font-bold ring-1 ring-brand" : "hover:bg-surface-300")}>
                    {Number(d.slice(8))}
                    {n > 0 && d !== day && <span aria-hidden className="absolute bottom-0.5 size-1 rounded-full bg-brand" />}
                  </button>
                );
              })}
            </div>
          </Card>
          <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border-strong text-sm font-semibold xl:hidden">
            <SlidersHorizontal aria-hidden className="size-4" />Profissionais, busca e legenda
          </button>
          {filterPanel}
        </div>

        <Card className="min-w-0 p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border p-3">
            <div className="flex items-center gap-1">
              <button type="button" aria-label="Anterior" onClick={() => setDay(addDays(day, view === "day" ? -1 : -7))} className="grid size-10 place-items-center rounded-pill hover:bg-surface-300"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => setDay(todayISO())} title="Atalho: T" aria-keyshortcuts="T" className="rounded-md border border-border-strong h-10 px-3 text-xs font-semibold hover:bg-surface-300">Hoje</button>
              <button type="button" aria-label="Próximo" onClick={() => setDay(addDays(day, view === "day" ? 1 : 7))} className="grid size-10 place-items-center rounded-pill hover:bg-surface-300"><ChevronRight className="size-4" /></button>
            </div>
            <h2 className="text-sm font-semibold first-letter:uppercase flex-1 min-w-48">{label} <span className="font-normal text-ink-muted">· {plural(total, "compromisso", "compromissos")}</span></h2>
            <div className="flex flex-wrap items-center gap-2">
            {view === "week" && <label className="flex min-h-10 items-center gap-1.5 text-xs"><input type="checkbox" className="size-5" checked={hideWeekend} onChange={(e) => setHideWeekend(e.target.checked)} />Sem fim de semana</label>}
            {view === "day" && mobile && hasPros && (
              <Select aria-label="Profissional" className="!w-auto flex-1 min-w-36" value={mobilePros.some((c) => c.key === mobileProf) ? mobileProf : "all"} onChange={(e) => setMobileProf(e.target.value)}>
                <option value="all">Todos os profissionais</option>
                {mobilePros.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              </Select>
            )}
            <Segmented size="sm" label="Visualização" value={view} onChange={setView} options={[{ value: "day", label: view === "day" && hasPros ? "Dia por profissional" : "Dia" }, { value: "week", label: "Semana" }]} />
            <Segmented size="sm" label="Zoom da grade" value={zoom} onChange={setZoom} options={[{ value: "30", label: "30 min" }, { value: "60", label: "60 min" }]} />
            <Button size="sm" variant="secondary" onClick={() => setBlockForm({ date: day })}><Lock aria-hidden className="size-4" />Bloquear</Button>
            <Button size="sm" title="Atalho: N" aria-keyshortcuts="N" onClick={() => setForm({ preset: { date: day } })}><Plus className="size-4" />Nova consulta</Button>
            </div>
          </div>

          {dayEmpty && <p className="p-6 text-center text-sm text-ink-muted">Todos os profissionais estão ocultos. Marque algum em &ldquo;Profissionais&rdquo;.</p>}
          {!dayEmpty && (
            <div className="overflow-x-auto">
              <div style={{ minWidth: 56 + columns.length * minCol }}>
                <div className="grid border-b border-border" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0,1fr))` }}>
                  <div />
                  {columns.map(({ id, date: d, col }) => {
                    const untimed = colAppts(d, col).filter((a) => !a.time);
                    return (
                      <div key={id} className="border-l border-border">
                        {view === "day" && col.mode === "pro" && col.color && <div aria-hidden className="h-1.5" style={{ background: col.color }} />}
                        <div className="px-1 py-2 text-center">
                          {view === "week"
                            ? (
                              <button type="button" onClick={() => { setDay(d); setView("day"); }} className={cx("min-h-10 text-xs font-semibold first-letter:uppercase", d === todayISO() && "text-brand")}>
                                {fromISODate(d).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} <span className={cx("inline-grid size-6 place-items-center rounded-full", d === todayISO() && "bg-brand text-on-brand")}>{Number(d.slice(8))}</span>
                              </button>
                            )
                            : <p className="truncate text-xs font-semibold" title={col.name}>{col.name}</p>}
                          {untimed.map((a) => (
                            <button key={a.id} type="button" onClick={() => setForm({ editing: a })} className="mt-1 block min-h-6 w-full truncate rounded-sm bg-surface-300 px-1 text-[11px]" title={`${name(a)} · horário a definir`}>
                              ⏱ {name(a)}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div ref={scroller} className="relative max-h-[65vh] overflow-y-auto">
                  <div className="grid" style={{ gridTemplateColumns: `56px repeat(${columns.length}, minmax(0,1fr))`, height: (END - START) * hourPx }}>
                    <div className="relative">
                      {hours.map((h) => <span key={h} className={cx("absolute right-2 text-[11px] text-ink-muted tabular-nums", h > START ? "-translate-y-1/2" : "top-1")} style={h > START ? { top: (h - START) * hourPx } : undefined}>{`${h}:00`}</span>)}
                    </div>
                    {columns.map(({ id, date: d, col }) => {
                      const placed = layoutLanes(colAppts(d, col).filter((a) => a.time).map((a) => ({ ...a, start: toMin(a.time!), end: toMin(a.time!) + a.durationMinutes })));
                      return (
                        <div key={id} className="relative border-l border-border" role="group" aria-label={`${dateLong(d)}${view === "day" ? `, ${col.name}` : ""}`}>
                          {Array.from({ length: ((END - START) * 60) / step }, (_, i) => {
                            const min = START * 60 + i * step;
                            return (
                              <button key={i} type="button" aria-label={`Marcar ${dateLong(d)} às ${fmtMin(min)}${view === "day" ? `, ${col.name}` : ""}`} tabIndex={min % 60 === 0 ? 0 : -1}
                                onClick={() => setForm({ preset: { date: d, time: fmtMin(min), professionalId: presetPro(col) } })}
                                className={cx("absolute inset-x-0 hover:bg-brand-soft/60 focus:bg-brand-soft", min % 60 === 0 ? "border-t border-border" : "border-t border-dotted border-border")}
                                style={{ top: i * step * ppm, height: step * ppm }} />
                            );
                          })}
                          {colBlocks(d, col).map((b) => (
                            <button key={b.id} type="button" onClick={() => setBlockView(b)} aria-label={`Bloqueado das ${b.startTime} às ${b.endTime}: ${b.reason}${proOf(b.professionalId) ? `, ${proOf(b.professionalId)!.name}` : ", toda a clínica"}`}
                              className="absolute inset-x-0.5 z-10 overflow-hidden rounded-sm border border-border-strong bg-surface-300 px-1 text-left text-[11px] text-ink-muted"
                              style={{ top: (toMin(b.startTime) - START * 60) * ppm, height: Math.max(20, (toMin(b.endTime) - toMin(b.startTime)) * ppm - 1), backgroundImage: HATCH }}>
                              <span className="inline-flex max-w-full items-center gap-1 rounded-sm bg-surface-300 px-1"><Lock aria-hidden className="size-3 shrink-0" /><span className="truncate">{b.reason}</span></span>
                            </button>
                          ))}
                          {d === todayISO() && nowMin >= START * 60 && nowMin <= END * 60 && (
                            <div aria-hidden className="pointer-events-none absolute inset-x-0 z-30 border-t-2 border-brand" style={{ top: (nowMin - START * 60) * ppm }}>
                              <span className="absolute -left-1 -top-1.5 size-2.5 rounded-full bg-brand" />
                            </div>
                          )}
                          {placed.map((a) => apptCard(a, col))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
      {form && <AppointmentForm open onClose={() => setForm(null)} preset={form.preset} editing={form.editing} />}
      {blockForm && <BlockDialog db={db} preset={blockForm} onClose={() => setBlockForm(null)} />}
      {blockView && <BlockDetail block={blockView} professionalName={proOf(blockView.professionalId)?.name} onClose={() => setBlockView(null)} />}
      {managing && <ProfessionalsDialog professionals={db.professionals as Professional[]} onClose={() => setManaging(false)} />}
    </div>
  );
}
