"use client";

import { useState } from "react";
import { api, useDb } from "@/lib/store";
import { addDays, parseMoney, todayISO } from "@/lib/format";
import { Modal, Button, Field, Input, Toggle } from "./ui";
import { PatientPicker } from "./patient-picker";
import { PatientForm } from "./patient-form";
import { useAction } from "./toast";

export function TreatmentForm({ open, onClose, patientId: initialPatient }: { open: boolean; onClose: () => void; patientId?: string }) {
  const db = useDb();
  const run = useAction();
  const [patientId, setPatientId] = useState(initialPatient);
  const [proc, setProc] = useState("");
  const [date, setDate] = useState(todayISO());
  const [price, setPrice] = useState("");
  const [received, setReceived] = useState(true);
  const [next, setNext] = useState(false);
  const [nextDate, setNextDate] = useState(addDays(todayISO(), 180));
  const [tried, setTried] = useState(false);
  const [newPatient, setNewPatient] = useState<string | null>(null);
  if (!db) return null;

  const valid = !!patientId && proc.trim().length > 1;
  const save = async () => {
    setTried(true);
    if (!valid) return;
    await run(() => api.treatments.log({
      patientId: patientId!, procedureName: proc.trim(), performedAt: date, priceCents: parseMoney(price) ?? 0,
      paymentStatus: received ? "received" : "pending", clinicalStatus: "done",
      nextAppointmentDate: next ? nextDate : undefined,
    }), "Atendimento registrado.");
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Registrar atendimento" subtitle="Algo que você já fez, com ou sem orçamento antes."
        footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save}>Registrar</Button></>}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <PatientPicker patients={db.patients} value={patientId} onChange={setPatientId} onCreate={setNewPatient} invalid={tried && !patientId} />
          <Field label="Procedimento" error={tried && proc.trim().length < 2 ? "Diga o que foi feito." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} list="procs" value={proc} onChange={(e) => setProc(e.target.value)} placeholder="Ex.: consulta, limpeza" invalid={tried && proc.trim().length < 2} />}
          </Field>
          <datalist id="procs">{["Consulta inicial", "Consulta de retorno", "Profilaxia (limpeza)", "Atendimento de urgência", "Restauração em resina – 1 face", "Extração simples"].map((p) => <option key={p} value={p} />)}</datalist>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data">{(id) => <Input id={id} type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Valor (R$)">{(id) => <Input id={id} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" />}</Field>
          </div>
          <Toggle checked={received} onChange={setReceived} label="Já recebi" hint="Entra no caixa agora. Desligado, fica como a receber." />
          <Toggle checked={next} onChange={setNext} label="Agendar retorno" hint="Cria um compromisso na agenda para este paciente." />
          {next && <Field label="Data do retorno">{(id) => <Input id={id} type="date" value={nextDate} min={todayISO()} onChange={(e) => setNextDate(e.target.value)} />}</Field>}
          <button type="submit" hidden />
        </form>
      </Modal>
      {newPatient !== null && <PatientForm open initial={{ fullName: newPatient }} onClose={() => setNewPatient(null)} onSaved={setPatientId} />}
    </>
  );
}
