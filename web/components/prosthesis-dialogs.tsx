"use client";

import { useId, useState } from "react";
import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/store";
import { dateBR, parseMoney, whatsappLink } from "@/lib/format";
import { KINDS, STAGES, kindName, type JobInput } from "@/lib/prosthesis";
import { MAX_COMMENT, type Db, type ProsthesisJob, type ProsthesisKind, type ProsthesisStage } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { PatientPicker } from "./patient-picker";
import { useAction } from "./toast";

const toInput = (cents?: number) => (cents === undefined ? "" : (cents / 100).toFixed(2).replace(".", ","));
const stamp = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface Form {
  professional: string; description: string; kind: ProsthesisKind; teeth: string; shade: string; laboratoryId: string;
  sentOn: string; dueOn: string; cost: string; notes: string; label: string; isReturn: boolean; returnReason: string;
}
const formOf = (db: Db, j?: ProsthesisJob): Form => ({
  professional: j?.professional ?? db.profile.professionalName ?? "", description: j?.description ?? "", kind: j?.kind ?? "crown", teeth: j?.teeth ?? "", shade: j?.shade ?? "",
  laboratoryId: j?.laboratoryId ?? "", sentOn: j?.sentOn ?? "", dueOn: j?.dueOn ?? "", cost: toInput(j?.costCents), notes: j?.notes ?? "", label: j?.label ?? "",
  isReturn: j?.isReturn ?? false, returnReason: j?.returnReason ?? "",
});
const inputOf = (patientId: string, f: Form): JobInput => ({
  patientId, professional: f.professional, description: f.description, kind: f.kind, teeth: f.teeth, shade: f.shade, laboratoryId: f.laboratoryId || undefined,
  sentOn: f.sentOn || undefined, dueOn: f.dueOn || undefined, costCents: f.cost.trim() ? parseMoney(f.cost) : undefined, notes: f.notes, label: f.label,
  isReturn: f.isReturn, returnReason: f.returnReason,
});

/** Erros de campo do formulário (os mesmos limites do servidor). */
function errorsOf(f: Form) {
  return {
    professional: !f.professional.trim(), description: !f.description.trim(),
    cost: f.cost.trim() !== "" && (parseMoney(f.cost) ?? -1) < 0,
    dates: !!f.sentOn && !!f.dueOn && f.dueOn < f.sentOn,
    reason: f.isReturn && !f.returnReason.trim(),
  };
}

function JobFields({ db, f, set, tried }: { db: Db; f: Form; set: (p: Partial<Form>) => void; tried: boolean }) {
  const e = errorsOf(f);
  const list = useId();
  const names = [...new Set([db.profile.professionalName ?? "", ...db.prosthesisJobs.map((j) => j.professional)].filter(Boolean))];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Profissional" error={tried && e.professional ? "Informe o profissional." : undefined}>
        {(id, d) => (
          <>
            <Input id={id} aria-describedby={d} invalid={tried && e.professional} maxLength={120} list={list} value={f.professional} onChange={(x) => set({ professional: x.target.value })} />
            <datalist id={list}>{names.map((n) => <option key={n} value={n} />)}</datalist>
          </>
        )}
      </Field>
      <Field label="Tipo de serviço">
        {(id) => <Select id={id} value={f.kind} onChange={(x) => set({ kind: x.target.value as ProsthesisKind })}>{KINDS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</Select>}
      </Field>
      <Field label="Descrição do serviço" className="sm:col-span-2" error={tried && e.description ? "Descreva o serviço." : undefined}>
        {(id, d) => <Input id={id} aria-describedby={d} invalid={tried && e.description} maxLength={255} placeholder="Ex.: Coroa de zircônia no 26" value={f.description} onChange={(x) => set({ description: x.target.value })} />}
      </Field>
      <Field label="Dentes ou região">{(id) => <Input id={id} maxLength={60} placeholder="Ex.: 26 ou arcada superior" value={f.teeth} onChange={(x) => set({ teeth: x.target.value })} />}</Field>
      <Field label="Cor ou escala">{(id) => <Input id={id} maxLength={40} placeholder="Ex.: A2 (Vita)" value={f.shade} onChange={(x) => set({ shade: x.target.value })} />}</Field>
      <Field label="Laboratório" className="sm:col-span-2">
        {(id) => <Select id={id} value={f.laboratoryId} onChange={(x) => set({ laboratoryId: x.target.value })}><option value="">Sem laboratório</option>{db.laboratories.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>}
      </Field>
      <Field label="Data de envio">{(id) => <Input id={id} type="date" value={f.sentOn} onChange={(x) => set({ sentOn: x.target.value })} />}</Field>
      <Field label="Previsão de retorno" error={e.dates ? "A previsão não pode ser antes do envio." : undefined}>
        {(id, d) => <Input id={id} aria-describedby={d} invalid={e.dates} type="date" value={f.dueOn} onChange={(x) => set({ dueOn: x.target.value })} />}
      </Field>
      <Field label="Valor do laboratório (R$)" error={e.cost ? "Valor inválido." : undefined}>
        {(id, d) => <Input id={id} aria-describedby={d} invalid={e.cost} inputMode="decimal" placeholder="0,00" value={f.cost} onChange={(x) => set({ cost: x.target.value })} />}
      </Field>
      <Field label="Rótulo" hint="Até 30 caracteres. Ex.: urgente.">{(id, d) => <Input id={id} aria-describedby={d} maxLength={30} value={f.label} onChange={(x) => set({ label: x.target.value })} />}</Field>
      <Field label="Observações" className="sm:col-span-2">{(id) => <Textarea id={id} maxLength={500} value={f.notes} onChange={(x) => set({ notes: x.target.value })} />}</Field>
      <div className="space-y-2 rounded-md border border-border p-3 sm:col-span-2">
        <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input type="checkbox" className="size-5 shrink-0 accent-[var(--brand)]" checked={f.isReturn} onChange={(x) => set({ isReturn: x.target.checked })} />
          Serviço com retorno (refazer ou ajustar)
        </label>
        {f.isReturn && (
          <Field label="Motivo do retorno" error={tried && e.reason ? "Informe o motivo do retorno." : undefined}>
            {(id, d) => <Input id={id} aria-describedby={d} invalid={tried && e.reason} maxLength={255} placeholder="Ex.: cor não combinou, ajustar oclusão" value={f.returnReason} onChange={(x) => set({ returnReason: x.target.value })} />}
          </Field>
        )}
      </div>
    </div>
  );
}

const hasErrors = (f: Form) => Object.values(errorsOf(f)).some(Boolean);

/** Criar serviço: nasce em Pré-laboratório. Obrigatórios: paciente, profissional e descrição. */
export function CreateJobDialog({ db, onClose, onCreated }: { db: Db; onClose: () => void; onCreated: () => void }) {
  const run = useAction();
  const [patientId, setPatientId] = useState<string>();
  const [f, setF] = useState(() => formOf(db));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const submit = async () => {
    setTried(true);
    if (busy || !patientId || hasErrors(f)) return;
    setBusy(true);
    let ok = false;
    await run(async () => { await api.prosthesis.createJob(inputOf(patientId, f)); ok = true; }, "Serviço criado.");
    setBusy(false);
    if (ok) { onCreated(); onClose(); }
  };

  return (
    <Modal open onClose={onClose} wide title="Criar serviço" subtitle="Trabalho de prótese para um laboratório. Nasce em Pré-laboratório."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={busy}>Criar serviço</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <PatientPicker patients={db.patients.filter((p) => !p.archived)} value={patientId} onChange={setPatientId} invalid={tried && !patientId} />
          {tried && !patientId && <p role="alert" className="mt-1 text-sm font-semibold text-danger">Escolha o paciente.</p>}
        </div>
        <JobFields db={db} f={f} set={(p) => setF((x) => ({ ...x, ...p }))} tried={tried} />
        <button type="submit" className="sr-only" tabIndex={-1}>Criar</button>
      </form>
    </Modal>
  );
}

/** Detalhe do cartão: dados editáveis, etapa, WhatsApp, comentários e histórico. Exclusão só para o dono. */
export function JobDialog({ db, job, canDelete, onClose, onMove }: {
  db: Db; job: ProsthesisJob; canDelete: boolean; onClose: () => void; onMove: (j: ProsthesisJob, stage: ProsthesisStage) => void;
}) {
  const run = useAction();
  const patient = db.patients.find((p) => p.id === job.patientId);
  const lab = db.laboratories.find((l) => l.id === job.laboratoryId);
  const [f, setF] = useState(() => formOf(db, job));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const events = db.prosthesisEvents.filter((e) => e.jobId === job.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = patient?.fullName.split(" ")[0] ?? "";
  const labMsg = `Olá, ${lab?.name ?? ""}! Sobre o serviço de ${kindName(job.kind).toLowerCase()} do paciente ${patient?.fullName ?? ""}: ${job.description}.${job.dueOn ? ` Previsão de retorno: ${dateBR(job.dueOn)}.` : ""} Pode nos dar uma posição?`;
  const patientMsg = `Olá, ${first}! Passando para avisar sobre o seu trabalho de prótese (${job.description}).${job.dueOn ? ` A previsão é ${dateBR(job.dueOn)}.` : ""} Qualquer dúvida, é só falar.`;
  const original = JSON.stringify(formOf(db, job));
  const dirty = JSON.stringify(f) !== original;

  const save = async () => {
    setTried(true);
    if (busy || hasErrors(f)) return;
    setBusy(true);
    await run(() => api.prosthesis.updateJob(job.id, inputOf(job.patientId, f)), "Serviço atualizado.");
    setBusy(false);
  };
  const send = async () => {
    if (busy || !comment.trim()) return;
    setBusy(true);
    let ok = false;
    await run(async () => { await api.prosthesis.addComment(job.id, comment); ok = true; });
    setBusy(false);
    if (ok) setComment("");
  };
  const remove = async () => {
    let ok = false;
    await run(async () => { await api.prosthesis.deleteJob(job.id); ok = true; }, "Serviço excluído.");
    if (ok) onClose();
  };
  const wa = "inline-flex h-11 items-center gap-2 rounded-md bg-success-soft px-4 text-sm font-semibold";
  const waOff = "inline-flex h-11 items-center rounded-md bg-surface-300 px-4 text-sm text-ink-muted";

  return (
    <Modal open onClose={onClose} wide title={`${kindName(job.kind)}: ${job.description}`} subtitle={patient?.fullName ?? "Paciente removido"}>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {lab?.phone ? (
            <a href={whatsappLink(lab.phone, labMsg)} target="_blank" rel="noreferrer" className={wa}><MessageCircle aria-hidden className="size-4" />WhatsApp do laboratório</a>
          ) : <span className={waOff}>{lab ? "Laboratório sem telefone" : "Sem laboratório"}</span>}
          {patient?.phone ? (
            <a href={whatsappLink(patient.phone, patientMsg)} target="_blank" rel="noreferrer" className={wa}><MessageCircle aria-hidden className="size-4" />WhatsApp do paciente</a>
          ) : <span className={waOff}>Paciente sem telefone</span>}
        </div>

        <section aria-label="Dados do serviço" className="space-y-3">
          <Field label="Etapa">
            {(id) => <Select id={id} value={job.stage} onChange={(e) => onMove(job, e.target.value as ProsthesisStage)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
          </Field>
          <JobFields db={db} f={f} set={(p) => setF((x) => ({ ...x, ...p }))} tried={tried} />
          <Button onClick={save} loading={busy} disabled={!dirty}>Salvar alterações</Button>
        </section>

        <section aria-labelledby="job-hist">
          <h3 id="job-hist" className="mb-2 text-sm font-semibold">Comentários e histórico</h3>
          {events.length === 0 ? <p className="text-sm text-ink-muted">Nada registrado ainda.</p> : (
            <ol className="space-y-2">
              {events.map((e) => (
                <li key={e.id} className={e.kind === "comment" ? "rounded-md border border-border bg-surface-100 px-3 py-2" : "px-1 text-sm text-ink-muted"}>
                  <p className="text-xs text-ink-muted">{e.authorName ?? "Sistema"} · {stamp(e.createdAt)}{e.kind === "stage" && " · mudou de etapa"}</p>
                  <p className={e.kind === "comment" ? "whitespace-pre-wrap break-words text-sm" : "text-sm"}>{e.body}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-3 space-y-2">
            <Field label="Novo comentário" hint={`${comment.length} de ${MAX_COMMENT} caracteres`}>
              {(id, d) => <Textarea id={id} aria-describedby={d} maxLength={MAX_COMMENT} value={comment} onChange={(e) => setComment(e.target.value)} />}
            </Field>
            <Button variant="secondary" onClick={send} loading={busy} disabled={!comment.trim()}>Comentar</Button>
          </div>
        </section>

        {canDelete && (
          <section aria-label="Excluir serviço">
            {confirmDelete ? (
              <div role="group" aria-label="Confirmar exclusão do serviço" className="space-y-2 rounded-md bg-danger-soft p-3 text-sm">
                <p>Excluir este serviço e o histórico dele? Não dá para desfazer.</p>
                <div className="flex gap-2"><Button variant="danger" onClick={remove}>Excluir serviço</Button><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button></div>
              </div>
            ) : <Button variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 aria-hidden className="size-4" />Excluir serviço</Button>}
          </section>
        )}
      </div>
    </Modal>
  );
}

/** Laboratórios: criar, editar e excluir. Excluir mantém os serviços, só sem laboratório. */
export function LabsDialog({ db, canDelete, onClose }: { db: Db; canDelete: boolean; onClose: () => void }) {
  const run = useAction();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const uses = (id: string) => db.prosthesisJobs.filter((j) => j.laboratoryId === id).length;
  const reset = () => { setEditing(null); setName(""); setPhone(""); setNotes(""); };
  const edit = (id: string) => { const l = db.laboratories.find((x) => x.id === id); if (!l) return; setEditing(id); setName(l.name); setPhone(l.phone ?? ""); setNotes(l.notes ?? ""); };
  const submit = async () => {
    if (!name.trim()) return;
    let ok = false;
    await run(async () => {
      if (editing) await api.prosthesis.updateLab(editing, { name, phone, notes }); else await api.prosthesis.createLab({ name, phone, notes });
      ok = true;
    }, editing ? "Laboratório atualizado." : "Laboratório criado.");
    if (ok) reset();
  };

  return (
    <Modal open onClose={onClose} title="Laboratórios" subtitle="Cadastre os laboratórios para usar nos serviços e filtrar o quadro.">
      <div className="space-y-5">
        {db.laboratories.length === 0 ? <p className="text-sm text-ink-muted">Nenhum laboratório cadastrado.</p> : (
          <ul className="space-y-2">
            {db.laboratories.map((l) => (
              <li key={l.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{l.name}</p>
                    <p className="text-xs text-ink-muted">{[l.phone, `${uses(l.id)} ${uses(l.id) === 1 ? "serviço" : "serviços"}`].filter(Boolean).join(" · ")}</p>
                    {l.notes && <p className="mt-1 break-words text-sm">{l.notes}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="secondary" aria-label={`Editar ${l.name}`} onClick={() => edit(l.id)}><Pencil aria-hidden className="size-4" />Editar</Button>
                    {canDelete && <Button variant="ghost" aria-label={`Excluir ${l.name}`} onClick={() => setDeleting(l.id)}><Trash2 aria-hidden className="size-4" />Excluir</Button>}
                  </div>
                </div>
                {deleting === l.id && (
                  <div role="group" aria-label={`Confirmar exclusão de ${l.name}`} className="mt-3 space-y-2 rounded-md bg-danger-soft p-3 text-sm">
                    <p>{uses(l.id) ? `Os ${uses(l.id)} serviços deste laboratório ficam sem laboratório.` : "O laboratório será excluído."}</p>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => run(async () => { await api.prosthesis.deleteLab(l.id); setDeleting(null); }, "Laboratório excluído.")}>Excluir laboratório</Button>
                      <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <form className="space-y-3 rounded-md bg-surface-100 p-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <h3 className="text-sm font-semibold">{editing ? "Editar laboratório" : "Novo laboratório"}</h3>
          <Field label="Nome">{(id) => <Input id={id} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Telefone ou WhatsApp">{(id) => <Input id={id} type="tel" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
          <Field label="Observação">{(id) => <Input id={id} maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <div className="flex gap-2">
            <Button type="submit" disabled={!name.trim()}>{editing ? "Salvar laboratório" : "Criar laboratório"}</Button>
            {editing && <Button variant="ghost" onClick={reset}>Cancelar edição</Button>}
          </div>
        </form>
      </div>
    </Modal>
  );
}
