"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/store";
import { dateBR, money, parseMoney, whatsappLink } from "@/lib/format";
import { sortedStages } from "@/lib/sales";
import { MAX_COMMENT, type Db, type Opportunity } from "@/lib/types";
import { Button, Field, Input, Modal, Select, Textarea } from "./ui";
import { PatientPicker } from "./patient-picker";
import { useAction } from "./toast";

const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const stamp = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Detalhe do cartão: dados editáveis, etapa, WhatsApp, link dos orçamentos, comentários e histórico. */
export function OpportunityDialog({ db, opp, onClose, onMove }: {
  db: Db; opp: Opportunity; onClose: () => void; onMove: (o: Opportunity, stageId: string) => void;
}) {
  const run = useAction();
  const patient = db.patients.find((p) => p.id === opp.patientId);
  const budget = opp.budgetId ? db.budgets.find((b) => b.id === opp.budgetId) : undefined;
  const [title, setTitle] = useState(opp.title);
  const [value, setValue] = useState(toInput(opp.valueCents));
  const [responsible, setResponsible] = useState(opp.responsible ?? "");
  const [label, setLabel] = useState(opp.label ?? "");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const cents = parseMoney(value);
  const valueError = value.trim() && cents === undefined ? "Valor inválido." : undefined;
  const events = db.opportunityEvents.filter((e) => e.opportunityId === opp.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const first = patient?.fullName.split(" ")[0] ?? "";
  const msg = budget
    ? `Olá, ${first}! Passando para falar do seu orçamento de ${money(opp.valueCents)}. Posso tirar alguma dúvida?`
    : `Olá, ${first}! Passando para falar sobre ${opp.title}. Posso te ajudar com alguma dúvida?`;
  const dirty = title.trim() !== opp.title || (cents ?? 0) !== opp.valueCents || responsible.trim() !== (opp.responsible ?? "") || label.trim() !== (opp.label ?? "");

  const save = async () => {
    if (busy || valueError) return;
    setBusy(true);
    await run(() => api.sales.updateOpportunity(opp.id, { title, valueCents: cents ?? 0, responsible, label }), "Oportunidade atualizada.");
    setBusy(false);
  };
  const send = async () => {
    if (busy || !comment.trim()) return;
    setBusy(true);
    let ok = false;
    await run(async () => { await api.sales.addComment(opp.id, comment); ok = true; });
    setBusy(false);
    if (ok) setComment("");
  };

  return (
    <Modal open onClose={onClose} wide title={opp.title} subtitle={patient?.fullName ?? "Paciente removido"}>
      <div className="space-y-6">
        {budget?.status === "presented" && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm">Plano de tratamento aguardando aprovação desde {dateBR(budget.presentedAt)}.</p>
        )}

        <div className="flex flex-wrap gap-2">
          {patient?.phone ? (
            <a href={whatsappLink(patient.phone, msg)} target="_blank" rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-success-soft px-4 text-sm font-semibold"><MessageCircle aria-hidden className="size-4" />Conversar no WhatsApp</a>
          ) : (
            <span className="inline-flex h-11 items-center rounded-md bg-surface-300 px-4 text-sm text-ink-muted">Paciente sem telefone cadastrado</span>
          )}
          <Link href={`/orcamentos?paciente=${opp.patientId}`} className="inline-flex h-11 items-center rounded-md border-2 border-border-strong px-4 text-sm font-semibold text-brand hover:bg-brand-soft">Ver orçamentos do paciente</Link>
        </div>

        <section aria-label="Dados da oportunidade" className="grid gap-3 sm:grid-cols-2">
          <Field label="Etapa" className="sm:col-span-2">
            {(id) => <Select id={id} value={opp.stageId} onChange={(e) => onMove(opp, e.target.value)}>{sortedStages(db).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>}
          </Field>
          <Field label="Título" className="sm:col-span-2">{(id) => <Input id={id} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />}</Field>
          <Field label="Valor (R$)" error={valueError}>{(id, d) => <Input id={id} aria-describedby={d} invalid={!!valueError} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />}</Field>
          <Field label="Responsável">{(id) => <Input id={id} maxLength={120} value={responsible} onChange={(e) => setResponsible(e.target.value)} />}</Field>
          <Field label="Rótulo" hint="Até 30 caracteres. Ex.: urgente, retorno." className="sm:col-span-2">{(id, d) => <Input id={id} aria-describedby={d} maxLength={30} value={label} onChange={(e) => setLabel(e.target.value)} />}</Field>
          <div className="sm:col-span-2"><Button onClick={save} loading={busy} disabled={!dirty || !title.trim() || !!valueError}>Salvar alterações</Button></div>
        </section>

        <section aria-labelledby="opp-hist">
          <h3 id="opp-hist" className="mb-2 text-sm font-semibold">Comentários e histórico</h3>
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
      </div>
    </Modal>
  );
}

/** Criar oportunidade manual: nasce em Em aberto. */
export function CreateOpportunityDialog({ db, onClose, onCreated }: { db: Db; onClose: () => void; onCreated: (id: string) => void }) {
  const run = useAction();
  const [patientId, setPatientId] = useState<string>();
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [responsible, setResponsible] = useState(db.profile.professionalName ?? "");
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const cents = value.trim() ? parseMoney(value) : 0;
  const errors = { patient: !patientId, title: !title.trim(), value: cents === undefined };

  const submit = async () => {
    setTried(true);
    if (busy || errors.patient || errors.title || errors.value) return;
    setBusy(true);
    let id: string | undefined;
    await run(async () => { id = await api.sales.createOpportunity({ patientId: patientId!, title, valueCents: cents ?? 0, responsible }); }, "Oportunidade criada.");
    setBusy(false);
    if (id) { onCreated(id); onClose(); }
  };

  return (
    <Modal open onClose={onClose} title="Criar oportunidade" subtitle="Para negociações que não vêm de um orçamento. Orçamentos já criam a sua sozinhos."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={submit} loading={busy}>Criar oportunidade</Button></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div>
          <PatientPicker patients={db.patients.filter((p) => !p.archived)} value={patientId} onChange={setPatientId} invalid={tried && errors.patient} />
          {tried && errors.patient && <p role="alert" className="mt-1 text-sm font-semibold text-danger">Escolha o paciente.</p>}
        </div>
        <Field label="Título" error={tried && errors.title ? "Dê um título." : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={tried && errors.title} maxLength={120} placeholder="Ex.: Clareamento, aparelho ortodôntico" value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Valor estimado (R$)" error={errors.value ? "Valor inválido." : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={errors.value} inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
        <Field label="Responsável">{(id) => <Input id={id} maxLength={120} value={responsible} onChange={(e) => setResponsible(e.target.value)} />}</Field>
        <button type="submit" className="sr-only" tabIndex={-1}>Criar</button>
      </form>
    </Modal>
  );
}

/** Etapas do funil: renomear, criar e excluir. As quatro padrão não podem ser excluídas. */
export function StagesDialog({ db, onClose }: { db: Db; onClose: () => void }) {
  const run = useAction();
  const stages = sortedStages(db);
  const [names, setNames] = useState<Record<string, string>>({});
  const [fresh, setFresh] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [moveTo, setMoveTo] = useState("");
  const count = (id: string) => db.opportunities.filter((o) => o.stageId === id).length;
  const doomed = stages.find((s) => s.id === deleting);

  return (
    <Modal open onClose={onClose} title="Etapas do funil" subtitle="Renomeie, crie ou exclua etapas. Em aberto, Em andamento, Ganha e Perdida são padrão e não podem ser excluídas.">
      <div className="space-y-5">
        <ul className="space-y-3">
          {stages.map((s) => {
            const name = names[s.id] ?? s.name;
            return (
              <li key={s.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label={s.kind ? `Nome (etapa padrão, ${count(s.id)} cartões)` : `Nome (${count(s.id)} cartões)`} className="min-w-40 flex-1">
                    {(id) => <Input id={id} maxLength={40} value={name} onChange={(e) => setNames((x) => ({ ...x, [s.id]: e.target.value }))} />}
                  </Field>
                  <Button variant="secondary" disabled={!name.trim() || name.trim() === s.name}
                    onClick={() => run(async () => { await api.sales.renameStage(s.id, name); setNames((x) => Object.fromEntries(Object.entries(x).filter(([k]) => k !== s.id))); }, "Etapa renomeada.")}>
                    <Pencil aria-hidden className="size-4" />Renomear
                  </Button>
                  {!s.kind && (
                    <Button variant="ghost" aria-label={`Excluir a etapa ${s.name}`} onClick={() => { setDeleting(s.id); setMoveTo(stages.find((x) => x.id !== s.id)?.id ?? ""); }}>
                      <Trash2 aria-hidden className="size-4" />Excluir
                    </Button>
                  )}
                </div>
                {deleting === s.id && doomed && (
                  <div role="group" aria-label={`Confirmar exclusão de ${s.name}`} className="mt-3 space-y-2 rounded-md bg-danger-soft p-3 text-sm">
                    {count(s.id) > 0 ? (
                      <Field label={`Mover os ${count(s.id)} cartões para`}>
                        {(id) => <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{stages.filter((x) => x.id !== s.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>}
                      </Field>
                    ) : <p>A etapa está vazia e será excluída.</p>}
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={() => run(async () => { await api.sales.deleteStage(s.id, count(s.id) ? moveTo : undefined); setDeleting(null); }, "Etapa excluída.")}>Excluir etapa</Button>
                      <Button variant="ghost" onClick={() => setDeleting(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.sales.createStage(fresh); setFresh(""); }, "Etapa criada."); }}>
          <Field label="Nova etapa" className="min-w-40 flex-1">{(id) => <Input id={id} maxLength={40} placeholder="Ex.: Aguardando exame" value={fresh} onChange={(e) => setFresh(e.target.value)} />}</Field>
          <Button type="submit" disabled={!fresh.trim()}>Criar etapa</Button>
        </form>
      </div>
    </Modal>
  );
}

/** Define a meta de vendas do mês. Zero remove a meta. */
export function GoalDialog({ month, current, onClose }: { month: string; current: number; onClose: () => void }) {
  const run = useAction();
  const [value, setValue] = useState(current ? toInput(current) : "");
  const cents = value.trim() ? parseMoney(value) : 0;
  const label = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const save = async () => {
    if (cents === undefined) return;
    let ok = false;
    await run(async () => { await api.sales.setGoal(month, cents); ok = true; }, cents ? "Meta salva." : "Meta removida.");
    if (ok) onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Meta de ${label}`} subtitle="Quanto a clínica quer vender neste mês. Deixe vazio para remover."
      footer={<><Button variant="ghost" onClick={onClose}>Cancelar</Button><Button onClick={save} disabled={cents === undefined}>Salvar meta</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Field label="Objetivo do mês (R$)" error={cents === undefined ? "Valor inválido." : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={cents === undefined} inputMode="decimal" placeholder="Ex.: 50000,00" value={value} onChange={(e) => setValue(e.target.value)} />}
        </Field>
      </form>
    </Modal>
  );
}
