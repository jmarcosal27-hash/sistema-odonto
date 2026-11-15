"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Plus, CalendarPlus } from "lucide-react";
import { useDb, api, activePatients } from "@/lib/store";
import { dateBR, dateLong, todayISO, whatsappLink } from "@/lib/format";
import type { Appointment, WaitlistEntry, WaitlistStatus } from "@/lib/types";
import { Avatar, Badge, Button, Card, Empty, Field, Modal, PageSkeleton, Segmented, Select, Textarea } from "@/components/ui";
import { AgendaTabs } from "@/components/agenda-tabs";
import { PatientPicker } from "@/components/patient-picker";
import { AppointmentForm } from "@/components/appointment-form";
import { useAction } from "@/components/toast";

const LABEL: Record<WaitlistStatus, string> = { waiting: "Esperando", contacted: "Contatados", placed: "Encaixados", removed: "Removidos" };
const PERIOD = { morning: "Manhã", afternoon: "Tarde", any: "Qualquer horário" };

export default function Page() {
  const db = useDb();
  const run = useAction();
  const [tab, setTab] = useState<WaitlistStatus>("waiting");
  const [adding, setAdding] = useState(false);
  const [booking, setBooking] = useState<{ entry: WaitlistEntry; slot?: Appointment } | null>(null);
  if (!db) return <PageSkeleton />;

  const counts = Object.fromEntries((Object.keys(LABEL) as WaitlistStatus[]).map((s) => [s, db.waitlist.filter((w) => w.status === s).length])) as Record<WaitlistStatus, number>;
  const list = db.waitlist.filter((w) => w.status === tab).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // Horários futuros que vagaram por cancelamento e ainda não foram reocupados.
  const freed = db.appointments.filter((a) => a.status === "cancelled" && a.time && a.date >= todayISO()
    && !db.appointments.some((x) => x.id !== a.id && x.status !== "cancelled" && x.date === a.date && x.time === a.time))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const waiting = db.waitlist.filter((w) => w.status === "waiting" || w.status === "contacted");
  const name = (id: string) => db.patients.find((p) => p.id === id);

  return (
    <div className="space-y-4">
      <AgendaTabs />

      {freed.length > 0 && waiting.length > 0 && (
        <section className="rounded-lg bg-success-soft p-4" aria-labelledby="vagos">
          <h2 id="vagos" className="font-semibold">Horários que vagaram</h2>
          <p className="text-xs text-ink-muted mb-2">Consultas canceladas — boa chance para encaixar alguém da lista.</p>
          <ul className="flex flex-wrap gap-2">
            {freed.map((a) => (
              <li key={a.id}>
                <Button size="sm" variant="secondary" onClick={() => setBooking({ entry: waiting[0], slot: a })}>
                  {dateLong(a.date).split(",")[0]}, {dateBR(a.date).slice(0, 5)} às {a.time}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Situação" value={tab} onChange={setTab} options={(Object.keys(LABEL) as WaitlistStatus[]).map((s) => ({ value: s, label: `${LABEL[s]} · ${counts[s]}` }))} />
        <Button onClick={() => setAdding(true)}><Plus className="size-4" />Adicionar à lista</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {!list.length ? (
          <Empty title={tab === "waiting" ? "Ninguém esperando" : `Nenhum paciente em “${LABEL[tab]}”`}
            body={tab === "waiting" ? "Coloque aqui quem quer ser atendido antes. Quando uma consulta for cancelada, o horário aparece no topo para encaixe." : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {list.map((w) => {
              const p = name(w.patientId);
              if (!p) return null;
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={p.fullName} />
                  <div className="flex-1 min-w-48">
                    <Link href={`/pacientes/${p.id}`} className="font-semibold hover:underline">{p.fullName}</Link>
                    <p className="text-xs text-ink-muted">{PERIOD[w.period]} · na lista desde {dateBR(w.createdAt)}{w.notes ? ` · ${w.notes}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.phone && (tab === "waiting" || tab === "contacted") && (
                      <a href={whatsappLink(p.phone, `Olá, ${p.fullName.split(" ")[0]}! Abriu um horário mais cedo. Quer que eu reserve para você?`)} target="_blank" rel="noreferrer"
                        onClick={() => tab === "waiting" && api.waitlist.setStatus(w.id, "contacted")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-success-soft px-3 text-xs font-semibold"><MessageCircle className="size-4" />Avisar</a>
                    )}
                    {(tab === "waiting" || tab === "contacted") && <>
                      <Button size="sm" onClick={() => setBooking({ entry: w })}><CalendarPlus className="size-4" />Encaixar</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => api.waitlist.setStatus(w.id, "removed"), "Removido da lista.")}>Remover</Button>
                    </>}
                    {tab === "placed" && <Badge tone="success">Encaixado</Badge>}
                    {tab === "removed" && <Button size="sm" variant="ghost" onClick={() => run(() => api.waitlist.setStatus(w.id, "waiting"))}>Voltar para a lista</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {adding && <AddToWaitlist patients={activePatients(db)} onClose={() => setAdding(false)} />}
      {booking && (
        <AppointmentForm open onClose={() => setBooking(null)}
          preset={{ patientId: booking.entry.patientId, date: booking.slot?.date, time: booking.slot?.time, durationMinutes: booking.slot?.durationMinutes ?? 30 }} />
      )}
    </div>
  );
}

function AddToWaitlist({ patients, onClose }: { patients: ReturnType<typeof activePatients>; onClose: () => void }) {
  const run = useAction();
  const [patientId, setPatientId] = useState<string>();
  const [period, setPeriod] = useState<WaitlistEntry["period"]>("any");
  const [notes, setNotes] = useState("");
  return (
    <Modal open onClose={onClose} title="Adicionar à lista de espera"
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button disabled={!patientId} onClick={async () => {
        const ok = await run(async () => { await api.waitlist.add({ patientId: patientId!, period, notes: notes || undefined }); return true; }, "Adicionado à lista.");
        if (ok) onClose();
      }}>Adicionar</Button></>}>
      <div className="space-y-4">
        <PatientPicker patients={patients} value={patientId} onChange={setPatientId} />
        <Field label="Melhor período">{(id) => <Select id={id} value={period} onChange={(e) => setPeriod(e.target.value as WaitlistEntry["period"])}>{Object.entries(PERIOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}</Field>
        <Field label="Observação">{(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: só às quartas, urgência…" />}</Field>
      </div>
    </Modal>
  );
}
