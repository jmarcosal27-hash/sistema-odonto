"use client";

import { useState } from "react";
import type { Db, TimeBlock } from "@/lib/types";
import { MAX_BLOCK_DAYS, blockDates, toMin } from "@/lib/agenda";
import { api } from "@/lib/store";
import { addDays, dateLong, plural } from "@/lib/format";
import { Button, ErrorNote, Field, Input, Modal, Select } from "./ui";
import { useToast } from "./toast";

/** Bloquear horário: almoço, folga, manutenção. Vários dias cria um bloqueio por dia. */
export function BlockDialog({ db, preset, onClose }: { db: Db; preset: { date: string; time?: string; professionalId?: string }; onClose: () => void }) {
  const toast = useToast();
  const start = preset.time ?? "12:00";
  const [professionalId, setProfessionalId] = useState(preset.professionalId ?? "");
  const [date, setDate] = useState(preset.date);
  const [startTime, setStartTime] = useState(start);
  const [endTime, setEndTime] = useState(() => { const m = toMin(start) + 60; return m >= 1440 ? "23:59" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; });
  const [reason, setReason] = useState("Bloqueio");
  const [multi, setMulti] = useState(false);
  const [until, setUntil] = useState(addDays(preset.date, 4));
  const [skipWeekend, setSkipWeekend] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dates = multi ? blockDates(date, until, skipWeekend) : [date];

  const save = async () => {
    setError(null);
    if (toMin(endTime) <= toMin(startTime)) return setError("O fim precisa ser depois do início.");
    if (!dates.length) return setError("Nenhum dia no período escolhido.");
    if (dates.length > MAX_BLOCK_DAYS) return setError(`Escolha no máximo ${MAX_BLOCK_DAYS} dias.`);
    try {
      await api.timeBlocks.create({ professionalId: professionalId || undefined, dates, startTime, endTime, reason });
      const s = toMin(startTime), e = toMin(endTime);
      const under = db.appointments.filter((a) => a.time && a.status !== "cancelled" && dates.includes(a.date)
        && (!professionalId || (a.professionalId ?? "") === professionalId) && toMin(a.time) < e && s < toMin(a.time) + a.durationMinutes).length;
      toast(`${dates.length > 1 ? `${dates.length} dias bloqueados` : "Horário bloqueado"}.${under ? ` Atenção: ${plural(under, "agendamento já marcado", "agendamentos já marcados")} nesse período ${under === 1 ? "continua" : "continuam"} na agenda.` : ""}`);
      onClose();
    } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível bloquear."); }
  };

  return (
    <Modal open onClose={onClose} title="Bloquear horário" subtitle="Ninguém consegue agendar nesse período sem forçar encaixe."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={() => void save()}>Bloquear</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <ErrorNote message={error} />
        <Field label="Profissional">
          {(id) => (
            <Select id={id} value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
              <option value="">Toda a clínica</option>
              {db.professionals.filter((p) => p.active || p.id === professionalId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          )}
        </Field>
        <Field label={multi ? "A partir do dia" : "Dia"}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Início">{(id) => <Input id={id} type="time" step={300} value={startTime} onChange={(e) => setStartTime(e.target.value)} />}</Field>
          <Field label="Fim">{(id) => <Input id={id} type="time" step={300} value={endTime} onChange={(e) => setEndTime(e.target.value)} />}</Field>
        </div>
        <Field label="Motivo">{(id) => <Input id={id} maxLength={80} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: almoço, folga, manutenção do equipamento" />}</Field>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Vários dias</label>
        {multi && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <Field label="Até o dia" hint={dates.length ? `${plural(dates.length, "dia bloqueado", "dias bloqueados")}.` : undefined}>{(id, d) => <Input id={id} aria-describedby={d} type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={skipWeekend} onChange={(e) => setSkipWeekend(e.target.checked)} />Pular sábados e domingos</label>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

/** Detalhe de um bloqueio existente, com a opção de remover. */
export function BlockDetail({ block, professionalName, onClose }: { block: TimeBlock; professionalName?: string; onClose: () => void }) {
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    try { await api.timeBlocks.remove(block.id); toast("Bloqueio removido."); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Não foi possível remover."); }
  };
  return (
    <Modal open onClose={onClose} title={block.reason} subtitle="Horário bloqueado"
      footer={<><Button variant="ghost" onClick={onClose}>Fechar</Button><Button variant="danger" onClick={() => void remove()}>Remover bloqueio</Button></>}>
      <ErrorNote message={error} />
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs text-ink-muted">Dia</dt><dd className="first-letter:uppercase">{dateLong(block.date)}</dd></div>
        <div><dt className="text-xs text-ink-muted">Horário</dt><dd>{block.startTime} às {block.endTime}</dd></div>
        <div><dt className="text-xs text-ink-muted">Profissional</dt><dd>{professionalName ?? "Toda a clínica"}</dd></div>
      </dl>
    </Modal>
  );
}
