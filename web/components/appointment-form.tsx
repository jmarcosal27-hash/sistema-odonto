"use client";

import { useMemo, useState } from "react";
import { Plus, TriangleAlert, X } from "lucide-react";
import type { Appointment, AppointmentKind, AppointmentProcedure, AppointmentStatus } from "@/lib/types";
import { MAX_LABEL, MAX_PROCEDURES, MAX_REPEAT, STATUS_LABEL, STATUS_ORDER, findConflict, procedureTotals, repeatDates } from "@/lib/agenda";
import { allProcedures, api, useDb } from "@/lib/store";
import { dateBR, money, parseMoney, todayISO } from "@/lib/format";
import { Modal, Button, Field, Input, Segmented, Select, Textarea, ErrorNote } from "./ui";
import { PatientPicker } from "./patient-picker";
import { PatientForm } from "./patient-form";
import { useToast } from "./toast";

const DURATIONS = [15, 30, 45, 60, 90];

/** Linha editável: valor e duração como texto, para não brigar com a digitação. */
interface Row { k: number; name: string; price: string; minutes: string; procedureId?: string }
let rowKey = 0;
const toRow = (p?: AppointmentProcedure): Row => ({
  k: ++rowKey, name: p?.name ?? "", price: p ? (p.priceCents / 100).toFixed(2).replace(".", ",") : "", minutes: String(p?.durationMinutes ?? 30), procedureId: p?.procedureId,
});

export function AppointmentForm({ open, onClose, preset, editing }: {
  open: boolean; onClose: () => void; preset?: Partial<Appointment>; editing?: Appointment;
}) {
  const db = useDb();
  const toast = useToast();
  const [a, setA] = useState<Partial<Appointment>>(() => editing ?? {
    kind: "consultation", date: todayISO(), durationMinutes: 30, status: "to_confirm",
    ...Object.fromEntries(Object.entries(preset ?? {}).filter(([, v]) => v !== undefined)),
  });
  const [rows, setRows] = useState<Row[]>(() => (editing?.procedures ?? []).map(toRow));
  const [repeat, setRepeat] = useState(false);
  const [weekly, setWeekly] = useState(true);
  const [every, setEvery] = useState("14");
  const [times, setTimes] = useState("4");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<string | null>(null);

  const personal = a.kind === "personal";
  const procs = useMemo<AppointmentProcedure[]>(() => personal ? [] : rows.filter((r) => r.name.trim()).map((r) => ({
    name: r.name.trim(), priceCents: parseMoney(r.price) ?? 0, durationMinutes: Math.round(Number(r.minutes)) || 0, ...(r.procedureId ? { procedureId: r.procedureId } : {}),
  })), [rows, personal]);
  const totals = procedureTotals(procs);
  const duration = procs.length ? Math.min(600, Math.max(5, totals.minutes)) : a.durationMinutes ?? 30;
  const dates = repeat && !editing && a.date ? repeatDates(a.date, weekly ? 7 : Number(every) || 1, Number(times) || 2) : a.date ? [a.date] : [];

  const conflicts = useMemo(() => {
    if (!db || !a.time || a.status === "cancelled") return [];
    return dates.flatMap((date) => { const c = findConflict(db, { id: editing?.id, date, time: a.time, durationMinutes: duration, status: a.status ?? "to_confirm", professionalId: a.professionalId }); return c ? [{ date, text: c.text }] : []; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, a.time, a.status, a.professionalId, a.date, duration, repeat, weekly, every, times, editing?.id]);

  if (!db) return null;
  const set = (p: Partial<Appointment>) => setA((x) => ({ ...x, ...p }));
  const setRow = (k: number, p: Partial<Row>) => setRows((r) => r.map((x) => (x.k === k ? { ...x, ...p } : x)));
  const missing = personal ? !a.title?.trim() : !a.patientId;
  const catalog = allProcedures(db);
  const professionals = db.professionals.filter((p) => p.active || p.id === a.professionalId);

  // Nome igual ao do catálogo: preenche o valor de tabela (editável) e liga o procedimento.
  const pickName = (k: number, name: string) => {
    const hit = catalog.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    setRow(k, { name, procedureId: hit?.id, ...(hit && db.prices[hit.id] !== undefined ? { price: (db.prices[hit.id] / 100).toFixed(2).replace(".", ",") } : {}) });
  };

  const save = async () => {
    setTried(true); setError(null);
    if (missing || !a.date) return;
    if (rows.some((r) => r.name.trim() && !(Number(r.minutes) >= 1))) return setError("Informe a duração de cada procedimento (em minutos).");
    if (repeat && !editing && (!(Number(times) >= 2) || Number(times) > MAX_REPEAT)) return setError(`Repita de 2 a ${MAX_REPEAT} vezes.`);
    if (conflicts.length && !a.forced) return setError(`${conflicts[0].text}${conflicts.length > 1 ? ` (e mais ${conflicts.length - 1} data(s) da série)` : ""} Marque "Forçar encaixe" para marcar mesmo assim.`);
    const base = { ...(a as Appointment), patientId: personal ? undefined : a.patientId, professionalId: a.professionalId || undefined,
      procedures: procs.length ? procs : undefined, durationMinutes: duration, label: a.label?.trim() || undefined, forced: a.forced || undefined };
    let saved = 0;
    try {
      for (const date of dates) { await api.appointments.save({ ...base, date }); saved++; }
      const waiting = db.waitlist.filter((w) => w.status === "waiting" || w.status === "contacted").length;
      if (a.status === "cancelled" && editing?.status !== "cancelled" && a.time && waiting)
        toast(`Horário liberado. ${waiting} paciente(s) na lista de espera — veja em Agenda › Lista de espera.`);
      else toast(dates.length > 1 ? `${dates.length} compromissos marcados.` : editing ? "Compromisso atualizado." : "Compromisso marcado.");
      onClose();
    } catch (e) {
      setError((e instanceof Error ? e.message : "Não foi possível salvar.") + (saved ? ` Já foram marcados ${saved} de ${dates.length}.` : ""));
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} wide title={editing ? "Editar compromisso" : "Novo compromisso"}
        footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => void save()}>{editing ? "Salvar" : dates.length > 1 ? `Marcar ${dates.length}` : "Marcar"}</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <ErrorNote message={error} />
          <Segmented label="Tipo" value={a.kind as AppointmentKind} onChange={(v) => set({ kind: v })}
            options={[{ value: "consultation", label: "Consulta" }, { value: "return", label: "Retorno" }, { value: "personal", label: "Pessoal" }]} />
          {personal
            ? <Field label="Descrição" error={tried && missing ? "Dê um nome ao compromisso." : undefined}>{(id, d) => <Input id={id} aria-describedby={d} value={a.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: curso, reunião, banco" />}</Field>
            : <PatientPicker patients={db.patients} value={a.patientId} onChange={(v) => set({ patientId: v })} onCreate={setNewPatient} invalid={tried && missing} />}
          {db.professionals.length > 0 && (
            <Field label="Profissional">
              {(id) => (
                <Select id={id} value={a.professionalId ?? ""} onChange={(e) => set({ professionalId: e.target.value || undefined })}>
                  <option value="">Sem profissional</option>
                  {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (inativo)"}</option>)}
                </Select>
              )}
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia">{(id) => <Input id={id} type="date" value={a.date ?? ""} onChange={(e) => set({ date: e.target.value })} />}</Field>
            <Field label="Horário" hint="Em branco = a definir">{(id, d) => <Input id={id} aria-describedby={d} type="time" step={300} value={a.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined })} />}</Field>
          </div>

          {!personal && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">Procedimentos</legend>
              <datalist id="agenda-procedimentos">{catalog.map((p) => <option key={p.id} value={p.name} />)}</datalist>
              {rows.map((r, i) => (
                <div key={r.k} className="grid grid-cols-[1fr_auto] items-end gap-2 sm:grid-cols-[1fr_5.5rem_6.5rem_auto]">
                  <Field label={`Procedimento ${i + 1}`}>{(id) => <Input id={id} list="agenda-procedimentos" maxLength={120} value={r.name} onChange={(e) => pickName(r.k, e.target.value)} placeholder="Ex.: Limpeza" />}</Field>
                  <button type="button" aria-label={`Remover procedimento ${i + 1}`} onClick={() => setRows((x) => x.filter((y) => y.k !== r.k))}
                    className="order-2 grid size-11 place-items-center rounded-pill text-ink-muted hover:bg-surface-300 sm:order-1"><X aria-hidden className="size-5" /></button>
                  <div className="order-3 col-span-2 grid grid-cols-2 gap-2 sm:contents">
                    <Field label="Minutos">{(id) => <Input id={id} inputMode="numeric" value={r.minutes} onChange={(e) => setRow(r.k, { minutes: e.target.value.replace(/\D/g, "").slice(0, 3) })} />}</Field>
                    <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" value={r.price} onChange={(e) => setRow(r.k, { price: e.target.value })} placeholder="0,00" />}</Field>
                  </div>
                </div>
              ))}
              {rows.length < MAX_PROCEDURES && <Button type="button" size="sm" variant="secondary" onClick={() => setRows((r) => [...r, toRow()])}><Plus aria-hidden className="size-4" />Adicionar procedimento</Button>}
              {procs.length > 0 && <p className="text-sm font-semibold" aria-live="polite">Total: {totals.minutes} min · {money(totals.cents)}</p>}
            </fieldset>
          )}

          {procs.length === 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Duração</span>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented size="sm" label="Duração" value={String(a.durationMinutes)} onChange={(v) => set({ durationMinutes: Number(v) })}
                  options={DURATIONS.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : m === 60 ? "1 h" : "1h30" }))} />
                <Input aria-label="Outra duração em minutos" type="number" min={5} max={480} step={5} className="w-24" value={a.durationMinutes ?? ""} onChange={(e) => set({ durationMinutes: Number(e.target.value) || 30 })} />
              </div>
            </div>
          )}
          {procs.length > 0 && <p className="text-xs text-ink-muted">A duração do agendamento é a soma dos procedimentos: {duration} min.</p>}

          {(conflicts.length > 0 || a.forced) && (
            <div role="status" className="space-y-2 rounded-md border-2 border-warning bg-warning-soft p-3 text-sm">
              {conflicts.length > 0 && <p className="flex items-start gap-2 font-semibold"><TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />{conflicts[0].text}{conflicts.length > 1 && ` Mais ${conflicts.length - 1} data(s) da série também batem.`}</p>}
              <label className="flex min-h-10 items-center gap-2 font-medium"><input type="checkbox" className="size-5" checked={!!a.forced} onChange={(e) => set({ forced: e.target.checked })} />Forçar encaixe (marcar mesmo assim)</label>
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Situação</span>
              <Segmented size="sm" label="Situação" value={a.status as AppointmentStatus} onChange={(v) => set({ status: v })}
                options={STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
            </div>
          )}

          <Field label="Etiqueta" hint="Opcional. Aparece no cartão da agenda.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={MAX_LABEL} value={a.label ?? ""} onChange={(e) => set({ label: e.target.value || undefined })} placeholder="Ex.: primeira consulta" />}</Field>
          <Field label="Observações">{(id) => <Textarea id={id} value={a.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} />}</Field>

          {!editing && (
            <fieldset className="space-y-3">
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-5" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />Repetir este agendamento</label>
              {repeat && (
                <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
                  <Field label="Frequência">
                    {(id) => <Select id={id} value={weekly ? "w" : "n"} onChange={(e) => setWeekly(e.target.value === "w")}><option value="w">Toda semana</option><option value="n">A cada N dias</option></Select>}
                  </Field>
                  {!weekly ? <Field label="A cada quantos dias">{(id) => <Input id={id} type="number" min={1} max={365} value={every} onChange={(e) => setEvery(e.target.value)} />}</Field> : <span />}
                  <Field label="Quantidade total" hint={`Contando este, de 2 a ${MAX_REPEAT}.`} className="col-span-2">{(id, d) => <Input id={id} aria-describedby={d} type="number" min={2} max={MAX_REPEAT} value={times} onChange={(e) => setTimes(e.target.value)} />}</Field>
                  {dates.length > 1 && <p className="col-span-2 text-xs text-ink-muted">Datas: {dates.map(dateBR).join(", ")}.</p>}
                </div>
              )}
            </fieldset>
          )}
          <button type="submit" hidden />
        </form>
      </Modal>
      {newPatient !== null && <PatientForm open initial={{ fullName: newPatient }} onClose={() => setNewPatient(null)} onSaved={(id) => set({ patientId: id })} />}
    </>
  );
}
