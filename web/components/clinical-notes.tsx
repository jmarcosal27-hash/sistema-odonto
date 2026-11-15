"use client";

import { ask } from "./confirm";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, isReadOnly } from "@/lib/store";
import { dateBR, todayISO } from "@/lib/format";
import type { ClinicalNote, Db } from "@/lib/types";
import { Badge, Button, Card, ErrorNote, Field, Modal, Select, Textarea, Input } from "./ui";
import { useAction } from "./toast";

/** Evolução clínica do paciente: notas por consulta, ligadas (ou não) a um atendimento. */
export function ClinicalNotes({ db, patientId }: { db: Db; patientId: string }) {
  const run = useAction();
  const [editing, setEditing] = useState<ClinicalNote | "new" | null>(null);
  const notes = db.clinicalNotes
    .filter((n) => n.patientId === patientId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const treatmentName = (id?: string) => db.treatments.find((t) => t.id === id)?.procedureName;
  const readOnly = isReadOnly(db);

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Evolução clínica</h3>
        <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing("new")}><Plus className="size-4" />Nova nota</Button>
      </div>
      {!notes.length ? (
        <p className="text-sm text-ink-muted mt-2">Nenhuma nota ainda. Registre aqui o que foi feito e observado em cada consulta.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {notes.map((n) => (
            <li key={n.id} className="py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{dateBR(n.date)}</span>
                  {treatmentName(n.treatmentId) && <Badge tone="accent">{treatmentName(n.treatmentId)}</Badge>}
                </span>
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={readOnly} onClick={() => setEditing(n)} aria-label={`Editar nota de ${dateBR(n.date)}`}><Pencil className="size-3.5" />Editar</Button>
                  <Button size="sm" variant="ghost" disabled={readOnly} aria-label={`Excluir nota de ${dateBR(n.date)}`}
                    onClick={async () => { if (await ask({ title: "Excluir esta nota de evolução?", body: "Não dá para desfazer.", confirmLabel: "Excluir", danger: true })) void run(() => api.clinicalNotes.remove(n.id), "Nota excluída."); }}>
                    <Trash2 className="size-3.5" />Excluir
                  </Button>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words">{n.body}</p>
              {n.updatedAt !== n.createdAt && <p className="mt-1 text-xs text-ink-muted">Editada em {dateBR(n.updatedAt)}</p>}
            </li>
          ))}
        </ul>
      )}
      {editing && <NoteForm db={db} patientId={patientId} note={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function NoteForm({ db, patientId, note, onClose }: { db: Db; patientId: string; note?: ClinicalNote; onClose: () => void }) {
  const [date, setDate] = useState(note?.date ?? todayISO());
  const [treatmentId, setTreatmentId] = useState(note?.treatmentId ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const treatments = db.treatments.filter((t) => t.patientId === patientId).sort((a, b) => b.performedAt.localeCompare(a.performedAt));

  const save = async () => {
    setTried(true);
    if (!body.trim() || !date) return;
    setSaving(true); setError(null);
    try {
      await api.clinicalNotes.save({ id: note?.id, patientId, treatmentId: treatmentId || undefined, date, body });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={note ? "Editar nota de evolução" : "Nova nota de evolução"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button loading={saving} onClick={save}>Salvar</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Data da consulta" error={tried && !date ? "Informe a data." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field label="Atendimento (opcional)">
            {(id) => (
              <Select id={id} value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)}>
                <option value="">Sem atendimento ligado</option>
                {treatments.map((t) => <option key={t.id} value={t.id}>{t.procedureName} · {dateBR(t.performedAt)}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Evolução" error={tried && !body.trim() ? "Escreva o que foi feito ou observado." : undefined}>
          {(id, d) => <Textarea id={id} aria-describedby={d} aria-invalid={tried && !body.trim() ? true : undefined} rows={7} maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Queixa, procedimento realizado, materiais, orientações, próximos passos…" />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
