"use client";

import { useState } from "react";
import type { Appointment, AppointmentKind, AppointmentStatus } from "@/lib/types";
import { api, useDb } from "@/lib/store";
import { todayISO } from "@/lib/format";
import { Modal, Button, Field, Input, Segmented, Textarea, ErrorNote } from "./ui";
import { PatientPicker } from "./patient-picker";
import { PatientForm } from "./patient-form";
import { useToast } from "./toast";

const DURATIONS = [15, 30, 45, 60, 90];

export function AppointmentForm({ open, onClose, preset, editing }: {
  open: boolean; onClose: () => void; preset?: Partial<Appointment>; editing?: Appointment;
}) {
  const db = useDb();
  const toast = useToast();
  const [a, setA] = useState<Partial<Appointment>>(() => editing ?? {
    kind: "consultation", date: todayISO(), durationMinutes: 30, status: "to_confirm",
    ...Object.fromEntries(Object.entries(preset ?? {}).filter(([, v]) => v !== undefined)),
  });
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPatient, setNewPatient] = useState<string | null>(null);
  if (!db) return null;
  const set = (p: Partial<Appointment>) => setA((x) => ({ ...x, ...p }));
  const personal = a.kind === "personal";
  const missing = personal ? !a.title?.trim() : !a.patientId;

  const save = async () => {
    setTried(true); setError(null);
    if (missing || !a.date) return;
    try {
      await api.appointments.save({ ...(a as Appointment), patientId: personal ? undefined : a.patientId });
      const waiting = db.waitlist.filter((w) => w.status === "waiting" || w.status === "contacted").length;
      if (a.status === "cancelled" && editing?.status !== "cancelled" && a.time && waiting)
        toast(`Horário liberado. ${waiting} paciente(s) na lista de espera — veja em Agenda › Lista de espera.`);
      else toast(editing ? "Compromisso atualizado." : "Compromisso marcado.");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Não foi possível salvar."); }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={editing ? "Editar compromisso" : "Novo compromisso"}
        footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>{editing ? "Salvar" : "Marcar"}</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <ErrorNote message={error} />
          <Segmented label="Tipo" value={a.kind as AppointmentKind} onChange={(v) => set({ kind: v })}
            options={[{ value: "consultation", label: "Consulta" }, { value: "return", label: "Retorno" }, { value: "personal", label: "Pessoal" }]} />
          {personal
            ? <Field label="Descrição" error={tried && missing ? "Dê um nome ao compromisso." : undefined}>{(id, d) => <Input id={id} aria-describedby={d} value={a.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="Ex.: curso, reunião, banco" />}</Field>
            : <PatientPicker patients={db.patients} value={a.patientId} onChange={(v) => set({ patientId: v })} onCreate={setNewPatient} invalid={tried && missing} />}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dia">{(id) => <Input id={id} type="date" value={a.date ?? ""} onChange={(e) => set({ date: e.target.value })} />}</Field>
            <Field label="Horário" hint="Em branco = a definir">{(id, d) => <Input id={id} aria-describedby={d} type="time" step={300} value={a.time ?? ""} onChange={(e) => set({ time: e.target.value || undefined })} />}</Field>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Duração</span>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented size="sm" label="Duração" value={String(a.durationMinutes)} onChange={(v) => set({ durationMinutes: Number(v) })}
                options={DURATIONS.map((m) => ({ value: String(m), label: m < 60 ? `${m} min` : m === 60 ? "1 h" : "1h30" }))} />
              <Input aria-label="Outra duração em minutos" type="number" min={5} max={480} step={5} className="w-24" value={a.durationMinutes ?? ""} onChange={(e) => set({ durationMinutes: Number(e.target.value) || 30 })} />
            </div>
          </div>
          {editing && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Situação</span>
              <Segmented size="sm" label="Situação" value={a.status as AppointmentStatus} onChange={(v) => set({ status: v })}
                options={[{ value: "to_confirm", label: "A confirmar" }, { value: "confirmed", label: "Confirmado" }, { value: "done", label: "Atendido" }, { value: "no_show", label: "Faltou" }, { value: "cancelled", label: "Cancelado" }]} />
            </div>
          )}
          <Field label="Observações">{(id) => <Textarea id={id} value={a.notes ?? ""} onChange={(e) => set({ notes: e.target.value || undefined })} />}</Field>
          <button type="submit" hidden />
        </form>
      </Modal>
      {newPatient !== null && <PatientForm open initial={{ fullName: newPatient }} onClose={() => setNewPatient(null)} onSaved={(id) => set({ patientId: id })} />}
    </>
  );
}
